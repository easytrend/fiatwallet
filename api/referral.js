/**
 * api/referral.js — Vercel Serverless Function
 *
 * FiatWallet Referral Program Endpoint
 * Rules:
 *  - 1 Ref Point for every 10 USD on-ramp or off-ramp completed by referred friends.
 *  - Referee account is permanently tied to referrer upon connecting or importing wallet.
 *  - Points are whole integers (no decimals). No $ or volume values exposed.
 *
 * Endpoints:
 *  - POST: Bind referee wallet to referrer wallet
 *  - GET ?address=<wallet>: Get user referral link, total friends referred, and referral points
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

      const referrerAddress = (body?.referrer_address || body?.referrer || '').trim();
      const referredAddress = (body?.referred_address || body?.referee || '').trim();

      if (!referrerAddress || !referredAddress) {
        return res.status(400).json({
          success: false,
          error: 'Both referrer_address and referred_address are required',
        });
      }

      if (referrerAddress.toLowerCase() === referredAddress.toLowerCase()) {
        return res.status(400).json({
          success: false,
          error: 'Users cannot refer their own wallet',
        });
      }

      // Check if already bound
      const { data: existing, error: checkError } = await supabase
        .from('referrals')
        .select('id, referrer_address')
        .ilike('referred_address', referredAddress)
        .maybeSingle();

      if (checkError) {
        // If table doesn't exist yet, return soft warning
        if (checkError.code === '42P01') {
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

      // Insert new binding
      const { error: insertError } = await supabase
        .from('referrals')
        .insert({
          referrer_address: referrerAddress,
          referred_address: referredAddress,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        // Handle race conditions or unique constraint violations
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
        referrer_address: referrerAddress,
        referred_address: referredAddress,
      });
    } catch (err) {
      console.error('[api/referral] POST error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // =========================================================================
  // GET: Fetch Referral Stats & Friends List for a Wallet
  // =========================================================================
  if (req.method === 'GET') {
    try {
      const userAddress = (req.query.address || '').trim();
      if (!userAddress) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address query parameter is required',
        });
      }

      const referralLink = `https://fiatwallet.app/?ref=${userAddress}`;

      // 1. Fetch referees from public.referrals
      const { data: refRows, error: refError } = await supabase
        .from('referrals')
        .select('referred_address, created_at')
        .ilike('referrer_address', userAddress);

      if (refError) {
        if (refError.code === '42P01') {
          // Table not created yet
          return res.status(200).json({
            success: true,
            address: userAddress,
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
          address: userAddress,
          referral_link: referralLink,
          total_referred_users: 0,
          referral_points: 0,
          referred_friends: [],
        });
      }

      const refereeAddresses = refRows.map(r => (r.referred_address || '').trim()).filter(Boolean);

      // 2. Fetch completed transactions for all referees
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
        address: userAddress,
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
