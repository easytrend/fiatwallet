/**
 * api/leaderboard.js — Vercel Serverless Function
 *
 * FiatWallet Points & Volume Leaderboard Endpoint
 *
 * Rules:
 *  - Personal: 1 USD on-ramp or off-ramp volume = 1 Point (status = 'COMPLETED')
 *  - Referral: 10 USD on-ramp or off-ramp volume of referred friends = 1 Point to referrer
 *  - Total Points = Personal Points + Referral Points
 *  - Points are whole integers (no decimals, no fractions).
 *  - No $ value or volume exposed in response.
 *
 * Query Params:
 *  - address: optional wallet address to get personal rank and stats
 *  - limit: number of top ranked users (default 50, max 100)
 *  - offset: pagination offset (default 0)
 *  - timeframe: 'all' | 'month' | 'week' (default 'all')
 */

import { createClient } from '@supabase/supabase-js';

function getTier(points) {
  const pts = Math.floor(Number(points) || 0);
  if (pts >= 20000) return { name: 'Legend', nextTarget: null, progress: 100 };
  if (pts >= 5000) return { name: 'Diamond', nextTarget: 20000, progress: Math.min(100, Math.round(((pts - 5000) / 15000) * 100)) };
  if (pts >= 1000) return { name: 'Gold', nextTarget: 5000, progress: Math.min(100, Math.round(((pts - 1000) / 4000) * 100)) };
  if (pts >= 250) return { name: 'Silver', nextTarget: 1000, progress: Math.min(100, Math.round(((pts - 250) / 750) * 100)) };
  if (pts > 0) return { name: 'Bronze', nextTarget: 250, progress: Math.min(100, Math.round((pts / 250) * 100)) };
  return { name: 'Unranked', nextTarget: 250, progress: 0 };
}

function maskAddress(addr) {
  if (!addr || typeof addr !== 'string') return '';
  const clean = addr.trim();
  if (clean.length <= 10) return clean;
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

export default async function handler(req, res) {
  // CORS & Edge Caching headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userAddress = req.query.address ? String(req.query.address).trim() : null;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const timeframe = (req.query.timeframe || 'all').toLowerCase().trim();

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      success: false,
      error: 'Supabase database configuration missing on server',
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    let aggregated = [];
    let refLeaderboard = [];
    let refereeMap = new Map(); // refereeLower -> referrerOriginal
    let referrerRefereesCount = new Map(); // referrerLower -> count
    let tagMap = new Map(); // lowerAddr -> tag_name

    // Fetch fiat_tags mapping (walletLower -> tag_name)
    try {
      const { data: tagRows } = await supabase
        .from('fiat_tags')
        .select('wallet_address, tag_name');
      if (Array.isArray(tagRows)) {
        for (const t of tagRows) {
          if (t.wallet_address && t.tag_name) {
            tagMap.set(t.wallet_address.trim().toLowerCase(), t.tag_name.trim());
          }
        }
      }
    } catch (e) {
      // Soft fail if fiat_tags is unavailable
    }

    // Self-healing: Check recent (last 14 days) P2P transactions in PENDING or ERROR status
    // that have valid on-chain signatures and auto-reconcile them to COMPLETED.
    try {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: stuckRows } = await supabase
        .from('p2p_transactions')
        .select('id, order_id, signature, status')
        .in('status', ['PENDING', 'ERROR'])
        .gte('created_at', fourteenDaysAgo)
        .not('signature', 'is', null)
        .not('signature', 'like', 'pending_%')
        .limit(20);

      if (Array.isArray(stuckRows) && stuckRows.length > 0) {
        const validStuck = stuckRows.filter(r => r.signature && r.signature.length >= 60);
        if (validStuck.length > 0) {
          const { Connection } = await import('@solana/web3.js');
          const rpcUrl = process.env.VITE_RPC_URL || process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
          const connection = new Connection(rpcUrl, 'confirmed');
          const sigs = validStuck.map(r => r.signature);
          const statuses = await connection.getSignatureStatuses(sigs, { searchTransactionHistory: true });
          if (statuses?.value) {
            const confirmedIds = [];
            for (let i = 0; i < validStuck.length; i++) {
              const st = statuses.value[i];
              if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') && !st.err) {
                confirmedIds.push(validStuck[i].id);
              }
            }
            if (confirmedIds.length > 0) {
              await supabase
                .from('p2p_transactions')
                .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
                .in('id', confirmedIds);
              console.log(`[api/leaderboard] Auto-healed ${confirmedIds.length} confirmed transactions to COMPLETED`);
            }
          }
        }
      }

      // Also self-heal any recent pending/error onramps by triggering relayer forward
      const { data: pendingOnramps } = await supabase
        .from('p2p_transactions')
        .select('id, order_id, user_address, status')
        .eq('transaction_type', 'p2p_onramp')
        .in('status', ['PENDING', 'FORWARD_FAILED', 'ERROR'])
        .gte('created_at', fourteenDaysAgo)
        .limit(5);

      if (Array.isArray(pendingOnramps) && pendingOnramps.length > 0) {
        const host = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.fiatwallet.app';
        for (const onramp of pendingOnramps) {
          try {
            await fetch(`${host}/api/relay_onramp_fee`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: onramp.order_id, destinationAddress: onramp.user_address })
            });
          } catch (err) {}
        }
      }
    } catch (e) {
      // Soft fail — do not block leaderboard if RPC has a momentary hiccup
    }

    // Attempt 1: If timeframe is 'all', try reading from public.leaderboard_view
    if (timeframe === 'all') {
      try {
        const { data: viewData, error: viewError } = await supabase
          .from('leaderboard_view')
          .select('*')
          .order('rank', { ascending: true });

        if (!viewError && Array.isArray(viewData) && viewData.length > 0) {
          aggregated = viewData.map(row => ({
            address: row.user_address,
            personal_points: Math.floor(Number(row.personal_points) || 0),
            referral_points: Math.floor(Number(row.referral_points) || 0),
            total_points: Math.floor(Number(row.total_points) || 0),
            total_transactions: Number(row.total_transactions) || 0,
            total_referred_users: Number(row.total_referred_users) || 0,
            last_active_at: row.last_active_at,
            rank: Number(row.rank) || 1,
          }));
        }
      } catch (e) {
        // Fallback to in-memory aggregation below
      }
    }

    // Attempt 2 / Timeframe Fallback: Query p2p_transactions & referrals directly
    if (aggregated.length === 0) {
      let query = supabase
        .from('p2p_transactions')
        .select('user_address, usd_value, status, created_at')
        .in('status', ['COMPLETED', 'SUCCESSFUL', 'CONFIRMED'])
        .not('user_address', 'is', null);

      if (timeframe === 'month') {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('created_at', thirtyDaysAgo);
      } else if (timeframe === 'week') {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('created_at', sevenDaysAgo);
      }

      const { data: txs, error: txError } = await query;
      if (txError) {
        console.warn('[api/leaderboard] Supabase query error:', txError.message);
        return res.status(500).json({ success: false, error: txError.message });
      }

      // Query referrals mapping (referee -> referrer)
      try {
        const { data: refs, error: refsError } = await supabase
          .from('referrals')
          .select('referrer_address, referred_address');
        
        if (!refsError && Array.isArray(refs)) {
          for (const r of refs) {
            const referee = (r.referred_address || '').trim().toLowerCase();
            const referrer = (r.referrer_address || '').trim();
            if (referee && referrer) {
              refereeMap.set(referee, referrer);
              const refLower = referrer.toLowerCase();
              referrerRefereesCount.set(refLower, (referrerRefereesCount.get(refLower) || 0) + 1);
            }
          }
        }
      } catch (e) {
        // Soft fail if referrals table is not created yet
      }

      // Group and sum in memory
      const userMap = new Map(); // lowerAddr -> record

      const getOrCreateEntry = (addr) => {
        const lower = addr.toLowerCase();
        let entry = userMap.get(lower);
        if (!entry) {
          entry = {
            address: addr,
            personal_usd: 0,
            referee_usd: 0,
            total_transactions: 0,
            total_referred_users: referrerRefereesCount.get(lower) || 0,
            last_active_at: null,
          };
          userMap.set(lower, entry);
        }
        return entry;
      };

      // Seed all referrers from referrals table so they appear on leaderboard
      for (const [refLower, count] of referrerRefereesCount.entries()) {
        let orig = refLower;
        for (const r of refereeMap.values()) {
          if (r.toLowerCase() === refLower) {
            orig = r;
            break;
          }
        }
        const entry = getOrCreateEntry(orig);
        entry.total_referred_users = count;
      }

      for (const tx of (txs || [])) {
        const addr = (tx.user_address || '').trim();
        if (!addr) continue;
        const usd = Math.max(0, Number(tx.usd_value) || 0);

        // Personal volume
        const personalEntry = getOrCreateEntry(addr);
        personalEntry.personal_usd += usd;
        personalEntry.total_transactions += 1;
        if (!personalEntry.last_active_at || new Date(tx.created_at) > new Date(personalEntry.last_active_at)) {
          personalEntry.last_active_at = tx.created_at;
        }

        // Referral volume: if this user was referred by someone
        const referrer = refereeMap.get(addr.toLowerCase());
        if (referrer && referrer.toLowerCase() !== addr.toLowerCase()) {
          const referrerEntry = getOrCreateEntry(referrer);
          referrerEntry.referee_usd += usd;
        }
      }

      // Convert to whole integer points (no decimals)
      // Rule: Personal = floor(personal_usd), Referral = floor(referee_usd / 10)
      const sorted = Array.from(userMap.values())
        .map(e => {
          const personalPts = Math.floor(e.personal_usd);
          const referralPts = Math.floor(e.referee_usd / 10);
          const totalPts = personalPts + referralPts;
          return {
            address: e.address,
            personal_points: personalPts,
            referral_points: referralPts,
            total_points: totalPts,
            total_transactions: e.total_transactions,
            total_referred_users: e.total_referred_users,
            last_active_at: e.last_active_at,
          };
        })
        .filter(e => e.total_points > 0)
        .sort((a, b) => b.total_points - a.total_points);

      // Assign dense rank
      let currentRank = 1;
      for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && sorted[i].total_points < sorted[i - 1].total_points) {
          currentRank = i + 1;
        }
        sorted[i].rank = currentRank;
      }
      aggregated = sorted;

      // Build dedicated Referral Leaderboard (Ranked by Referral Points & Friends)
      const referralList = Array.from(userMap.values())
        .map(e => {
          const referralPts = Math.floor(e.referee_usd / 10);
          const personalPts = Math.floor(e.personal_usd);
          const tag = tagMap.get(e.address.toLowerCase());
          return {
            address: e.address,
            short_address: maskAddress(e.address),
            fiat_tag: tag || null,
            display_name: tag ? (tag.startsWith('$') ? tag : `$${tag}`) : maskAddress(e.address),
            referral_points: referralPts,
            personal_points: personalPts,
            total_points: personalPts + referralPts,
            total_referred_users: e.total_referred_users || 0,
            total_transactions: e.total_transactions,
          };
        })
        .filter(e => e.total_referred_users > 0 || e.referral_points > 0)
        .sort((a, b) => {
          if (b.total_referred_users !== a.total_referred_users) {
            return b.total_referred_users - a.total_referred_users;
          }
          if (b.total_points !== a.total_points) {
            return b.total_points - a.total_points;
          }
          return b.referral_points - a.referral_points;
        });

      let currentRefRank = 1;
      for (let i = 0; i < referralList.length; i++) {
        if (i > 0 && (referralList[i].total_referred_users < referralList[i - 1].total_referred_users || referralList[i].total_points < referralList[i - 1].total_points)) {
          currentRefRank = i + 1;
        }
        referralList[i].rank = currentRefRank;
        const tierInfo = getTier(referralList[i].total_points);
        referralList[i].tier = tierInfo.name;
      }

      // Save referral list for response
      refLeaderboard = referralList;
    }

    const totalParticipants = aggregated.length;
    const totalPointsDistributed = aggregated.reduce((acc, row) => acc + (row.total_points || 0), 0);
    const totalReferralPointsDistributed = aggregated.reduce((acc, row) => acc + (row.referral_points || 0), 0);

    // Format leaderboard page
    const pageItems = aggregated.slice(offset, offset + limit).map(item => {
      const tierInfo = getTier(item.total_points);
      const tag = tagMap ? tagMap.get(item.address.toLowerCase()) : null;
      return {
        rank: item.rank,
        address: item.address,
        short_address: maskAddress(item.address),
        fiat_tag: tag || null,
        display_name: tag ? (tag.startsWith('$') ? tag : `$${tag}`) : maskAddress(item.address),
        total_points: Math.floor(item.total_points || 0),
        personal_points: Math.floor(item.personal_points || 0),
        referral_points: Math.floor(item.referral_points || 0),
        total_transactions: item.total_transactions,
        total_referred_users: item.total_referred_users || 0,
        tier: tierInfo.name,
      };
    });

    const referralPageItems = refLeaderboard.slice(offset, offset + limit);

    // Resolve user's personal card if an address was passed
    let userCard = null;
    if (userAddress) {
      const lowerUser = userAddress.toLowerCase();
      const found = aggregated.find(r => r.address.toLowerCase() === lowerUser);
      const foundRef = refLeaderboard.find(r => r.address.toLowerCase() === lowerUser);
      const tag = tagMap ? tagMap.get(lowerUser) : null;
      const totalPts = Math.floor(found?.total_points || 0);
      const tierInfo = getTier(totalPts);

      userCard = {
        address: userAddress,
        short_address: maskAddress(userAddress),
        fiat_tag: tag || null,
        display_name: tag ? (tag.startsWith('$') ? tag : `$${tag}`) : maskAddress(userAddress),
        rank: found ? found.rank : null,
        referral_rank: foundRef ? foundRef.rank : null,
        total_points: totalPts,
        personal_points: Math.floor(found?.personal_points || 0),
        referral_points: Math.floor(foundRef?.referral_points || found?.referral_points || 0),
        total_transactions: found?.total_transactions || 0,
        total_referred_users: foundRef?.total_referred_users || found?.total_referred_users || (referrerRefereesCount ? referrerRefereesCount.get(lowerUser) || 0 : 0),
        tier: tierInfo.name,
        next_tier_target: tierInfo.nextTarget,
        tier_progress: tierInfo.progress,
      };
    }

    return res.status(200).json({
      success: true,
      timeframe,
      user: userCard,
      leaderboard: pageItems,
      referral_leaderboard: referralPageItems,
      total_participants: totalParticipants,
      total_referrers: refLeaderboard.length,
      total_points_distributed: Math.floor(totalPointsDistributed),
      total_referral_points_distributed: Math.floor(totalReferralPointsDistributed),
    });
  } catch (err) {
    console.error('[api/leaderboard] Unhandled error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error calculating leaderboard',
    });
  }
}
