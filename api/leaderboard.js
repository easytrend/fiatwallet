/**
 * api/leaderboard.js — Vercel Serverless Function
 *
 * Leaderboard & Volume Points Endpoint
 * Rule: 1 USD on-ramp or off-ramp volume = 1 Point (status = 'COMPLETED')
 * Points are whole integers (no decimals).
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
            total_points: Math.floor(Number(row.total_points) || 0),
            total_transactions: Number(row.total_transactions) || 0,
            last_active_at: row.last_active_at,
            rank: Number(row.rank) || 1,
          }));
        }
      } catch (e) {
        // Fallback to table aggregation below
      }
    }

    // Attempt 2 / Timeframe Fallback: Query p2p_transactions directly
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

      // Group and sum in memory
      const userMap = new Map();
      for (const tx of (txs || [])) {
        const addr = (tx.user_address || '').trim();
        if (!addr) continue;
        const usd = Math.max(0, Number(tx.usd_value) || 0);

        let entry = userMap.get(addr);
        if (!entry) {
          entry = {
            address: addr,
            total_points: 0,
            total_transactions: 0,
            last_active_at: tx.created_at,
          };
          userMap.set(addr, entry);
        }

        entry.total_points += usd;
        entry.total_transactions += 1;
        if (new Date(tx.created_at) > new Date(entry.last_active_at)) {
          entry.last_active_at = tx.created_at;
        }
      }

      // Convert to integer points (no decimals) and sort descending
      const sorted = Array.from(userMap.values())
        .map(e => ({
          ...e,
          total_points: Math.floor(e.total_points),
        }))
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
    }

    const totalParticipants = aggregated.length;
    const totalPointsDistributed = aggregated.reduce((acc, row) => acc + (row.total_points || 0), 0);

    // Format leaderboard page
    const pageItems = aggregated.slice(offset, offset + limit).map(item => {
      const tierInfo = getTier(item.total_points);
      return {
        rank: item.rank,
        address: item.address,
        short_address: maskAddress(item.address),
        total_points: Math.floor(item.total_points || 0),
        total_transactions: item.total_transactions,
        tier: tierInfo.name,
      };
    });

    // Resolve user's personal card if an address was passed
    let userCard = null;
    if (userAddress) {
      const found = aggregated.find(r => r.address.toLowerCase() === userAddress.toLowerCase());
      if (found) {
        const tierInfo = getTier(found.total_points);
        userCard = {
          address: found.address,
          short_address: maskAddress(found.address),
          rank: found.rank,
          total_points: Math.floor(found.total_points || 0),
          total_transactions: found.total_transactions,
          tier: tierInfo.name,
          next_tier_target: tierInfo.nextTarget,
          tier_progress: tierInfo.progress,
        };
      } else {
        const tierInfo = getTier(0);
        userCard = {
          address: userAddress,
          short_address: maskAddress(userAddress),
          rank: null,
          total_points: 0,
          total_transactions: 0,
          tier: tierInfo.name,
          next_tier_target: 250,
          tier_progress: 0,
        };
      }
    }

    return res.status(200).json({
      success: true,
      timeframe,
      user: userCard,
      leaderboard: pageItems,
      total_participants: totalParticipants,
      total_points_distributed: Math.floor(totalPointsDistributed),
    });
  } catch (err) {
    console.error('[api/leaderboard] Unhandled error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error calculating leaderboard',
    });
  }
}
