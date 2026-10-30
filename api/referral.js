/**
 * api/referral.js — Vercel Serverless Function
 *
 * FiatWallet Referral Program Endpoint
 * Rules:
 *  - 1 Ref Point for every 10 USD on-ramp or off-ramp completed by referred friends.
 *  - Referral link uses Fiat Tag (e.g. https://fiatwallet.app/?ref=tagname) if created & linked.
 *  - Falls back to wallet address if no Fiat Tag exists yet.
 *  - Previous wallet address referral links continue to function seamlessly after a tag is created.
 *  - Points are whole integers (no decimals). No $ or volume values exposed.
 *
 * Endpoints:
 *  - POST: Bind referee wallet to referrer wallet (accepts wallet address or Fiat Tag)
 *  - GET ?address=<wallet_or_tag>: Get user referral link, Fiat Tag status, friends count, and points
 */

import { createClient } from '@supabase/supabase-js';

function maskAddress(addr) {
  if (!addr || typeof addr !== 'string') return '';
  const clean = addr.trim();
  if (clean.length <= 10) return clean;
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      success: false,
      error: 'Supabase database configuration missing on server',
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // =========================================================================
  // POST: Bind Referee to Referrer
  // =========================================================================
  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e) {
          // ignore
        }
      }

      const rawReferrer = (body?.referrer_address || body?.referrer || '').trim();
      const referredAddress = (body?.referred_address || body?.referee || '').trim();

      if (!rawReferrer || !referredAddress) {
        return res.status(400).json({
          success: false,
          error: 'Both referrer_address and referred_address are required',
        });
      }

      // 1. Resolve Fiat Tag to canonical wallet address if a tag was provided or linked
      let canonicalReferrer = rawReferrer;
      let referrerTag = null;

      try {
        const cleanTag = rawReferrer.replace(/^\$/, '').trim();
        const { data: tagLookup } = await supabase
          .from('fiat_tags')
          .select('wallet_address, tag_name')
          .or(`tag_name.ilike.$${cleanTag},tag_name.ilike.${cleanTag},wallet_address.ilike.${rawReferrer}`)
          .maybeSingle();

        if (tagLookup?.wallet_address) {
          canonicalReferrer = tagLookup.wallet_address;
          referrerTag = tagLookup.tag_name;
        }
      } catch (e) {
        // Soft fail if fiat_tags lookup is unavailable
      }

      if (canonicalReferrer.toLowerCase() === referredAddress.toLowerCase()) {
        return res.status(400).json({
          success: false,
          error: 'Users cannot refer their own wallet',
        });
      }

      // 2. Check if referee is already bound
      const { data: existing, error: checkError } = await supabase
        .from('referrals')
        .select('id, referrer_address')
        .ilike('referred_address', referredAddress)
        .maybeSingle();

      if (checkError) {
        if (checkError.code === '42P01' || checkError.code === 'PGRST205') {
          return res.status(200).json({
            success: false,
            warning: 'Referrals table pending database creation in Supabase',
          });
        }
        return res.status(500).json({ success: false, error: checkError.message });
      }

      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Wallet already tied to a referrer',
          already_bound: true,
          referrer_address: existing.referrer_address,
        });
      }

      // 3. Insert new binding using canonical wallet address
      const { error: insertError } = await supabase
        .from('referrals')
        .insert({
          referrer_address: canonicalReferrer,
          referred_address: referredAddress,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        if (insertError.code === '23505') {
          return res.status(200).json({
            success: true,
            message: 'Wallet already tied to a referrer',
            already_bound: true,
          });
        }
        return res.status(500).json({ success: false, error: insertError.message });
      }

      return res.status(200).json({
        success: true,
        message: 'Referral successfully recorded',
        referrer_address: canonicalReferrer,
        referrer_tag: referrerTag,
        referred_address: referredAddress,
      });
    } catch (err) {
      console.error('[api/referral] POST error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // =========================================================================
  // GET: Fetch Referral Stats & Friends List for a Wallet or Fiat Tag
  // =========================================================================
  if (req.method === 'GET') {
    try {
      const rawAddress = (req.query.address || '').trim();
      if (!rawAddress) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address query parameter is required',
        });
      }

      // 1. Resolve Fiat Tag if a tag was queried, or fetch linked tag for wallet
      let userWallet = rawAddress;
      let userFiatTag = null;

      try {
        const cleanTag = rawAddress.replace(/^\$/, '').trim();
        const { data: tagLookup } = await supabase
          .from('fiat_tags')
          .select('wallet_address, tag_name')
          .or(`tag_name.ilike.$${cleanTag},tag_name.ilike.${cleanTag},wallet_address.ilike.${rawAddress}`)
          .maybeSingle();

        if (tagLookup) {
          userWallet = tagLookup.wallet_address || userWallet;
          userFiatTag = tagLookup.tag_name;
        }
      } catch (e) {
        // Soft fail if fiat_tags lookup is unavailable
      }

      // 2. Build referral link: use Fiat Tag slug if created, otherwise wallet address
      let referralLink = `https://fiatwallet.app/?ref=${userWallet}`;
      if (userFiatTag) {
        const cleanTagSlug = userFiatTag.replace(/^\$/, '').trim();
        referralLink = `https://fiatwallet.app/?ref=${cleanTagSlug}`;
      }

      // 3. Fetch referees from public.referrals
      const { data: refRows, error: refError } = await supabase
        .from('referrals')
        .select('referred_address, created_at')
        .ilike('referrer_address', userWallet);

      if (refError) {
        if (refError.code === '42P01' || refError.code === 'PGRST205') {
          return res.status(200).json({
            success: true,
            address: userWallet,
            fiat_tag: userFiatTag,
            has_fiat_tag: Boolean(userFiatTag),
            referral_link: referralLink,
            total_referred_users: 0,
            referral_points: 0,
            referred_friends: [],
          });
        }
        return res.status(500).json({ success: false, error: refError.message });
      }

      if (!refRows || refRows.length === 0) {
        return res.status(200).json({
          success: true,
          address: userWallet,
          fiat_tag: userFiatTag,
          has_fiat_tag: Boolean(userFiatTag),
          referral_link: referralLink,
          total_referred_users: 0,
          referral_points: 0,
          referred_friends: [],
        });
      }

      const refereeAddresses = refRows.map(r => (r.referred_address || '').trim()).filter(Boolean);

      // 4. Fetch completed transactions for all referees
      const { data: txs, error: txError } = await supabase
        .from('p2p_transactions')
        .select('user_address, usd_value, status, created_at')
        .in('status', ['COMPLETED', 'SUCCESSFUL', 'CONFIRMED'])
        .in('user_address', refereeAddresses);

      if (txError) {
        console.warn('[api/referral] Referee tx fetch warning:', txError.message);
      }

      // Group referee volumes
      const volumeMap = new Map();
      for (const tx of (txs || [])) {
        const addr = (tx.user_address || '').trim().toLowerCase();
        const usd = Math.max(0, Number(tx.usd_value) || 0);
        const prev = volumeMap.get(addr) || { orders: 0, usdTotal: 0 };
        volumeMap.set(addr, {
          orders: prev.orders + 1,
          usdTotal: prev.usdTotal + usd,
        });
      }

      let grandRefereeUsd = 0;
      const friendsList = refRows.map(r => {
        const addrLower = (r.referred_address || '').trim().toLowerCase();
        const stats = volumeMap.get(addrLower) || { orders: 0, usdTotal: 0 };
        grandRefereeUsd += stats.usdTotal;

        // 1 Point per 10 USD completed volume (whole integer)
        const friendPts = Math.floor(stats.usdTotal / 10);

        return {
          address: r.referred_address,
          short_address: maskAddress(r.referred_address),
          completed_orders: stats.orders,
          points_earned: friendPts,
          joined_at: r.created_at,
        };
      });

      // Total referral points earned: whole integer (no decimals)
      const totalReferralPoints = Math.floor(grandRefereeUsd / 10);

      return res.status(200).json({
        success: true,
        address: userWallet,
        fiat_tag: userFiatTag,
        has_fiat_tag: Boolean(userFiatTag),
        referral_link: referralLink,
        total_referred_users: friendsList.length,
        referral_points: totalReferralPoints,
        referred_friends: friendsList,
      });
    } catch (err) {
      console.error('[api/referral] GET error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
