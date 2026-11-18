/**
 * api/compliance_check.js — Vercel Serverless Function
 *
 * Administrative & Forensics tool to inspect captured telemetry (IPs, User-Agents),
 * correlated wallets, and blacklist status for any target email, wallet, or IP address.
 *
 * Security:
 * Requires authorization secret (CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, or fiatwallet admin secret).
 *
 * Query Examples:
 *   GET /api/compliance_check?email=dbyoutubefamily@gmail.com&secret=...
 *   GET /api/compliance_check?ip=102.89.x.x&secret=...
 *   GET /api/compliance_check?wallet=8uCh1FWThkLFFvPQp4QPywxQ8uTWZGqKLEXiD8vwAngF&secret=...
 */

import { createClient } from '@supabase/supabase-js';
import { isBlacklisted, normalizeEmail, BLACKLISTED_EMAILS, BLACKLISTED_WALLETS } from './_compliance_blacklist.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. Authorization Guard
  const expectedSecrets = [
    process.env.CRON_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.RESEND_API_KEY,
    process.env.SYNC_SECRET,
    'fiatwallet-sync-resend-audience-v1',
  ].filter(Boolean);

  const authHeader = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const customHeader = (req.headers['x-admin-secret'] || '').trim();
  const querySecret = (req.query?.secret || '').trim();
  const provided = authHeader || customHeader || querySecret;

  if (expectedSecrets.length > 0 && (!provided || !expectedSecrets.includes(provided))) {
    return res.status(401).json({ error: 'Unauthorized. Provide valid secret in header or ?secret=...' });
  }

  const queryEmail = (req.query?.email || req.query?.e || '').trim();
  const queryWallet = (req.query?.wallet || req.query?.w || '').trim();
  const queryIp = (req.query?.ip || '').trim();

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    let result = {
      query: { email: queryEmail, wallet: queryWallet, ip: queryIp },
      blacklistStatus: isBlacklisted({ email: queryEmail, walletAddress: queryWallet }),
      knownBlacklistedEmails: BLACKLISTED_EMAILS,
      knownBlacklistedWallets: BLACKLISTED_WALLETS,
      capturedTelemetry: [],
      correlatedWallets: [],
      correlatedEmails: [],
    };

    // If query by email
    if (queryEmail) {
      const norm = normalizeEmail(queryEmail);
      const [sessRes, txRes] = await Promise.all([
        supabase.from('paj_sessions').select('id, email, wallet_address, ip_address, user_agent, created_at, updated_at').ilike('email', `%${norm}%`),
        supabase.from('p2p_transactions').select('id, order_id, user_email, user_address, ip_address, user_agent, status, created_at').ilike('user_email', `%${norm}%`),
      ]);

      const capturedIps = new Set();
      const linkedWallets = new Set();

      for (const s of (sessRes.data || [])) {
        if (s.ip_address) capturedIps.add(s.ip_address);
        if (s.wallet_address) linkedWallets.add(s.wallet_address);
      }
      for (const t of (txRes.data || [])) {
        if (t.ip_address) capturedIps.add(t.ip_address);
        if (t.user_address) linkedWallets.add(t.user_address);
      }

      result.sessions = sessRes.data || [];
      result.transactions = txRes.data || [];
      result.capturedIps = Array.from(capturedIps);
      result.linkedWallets = Array.from(linkedWallets);

      // Search for any other wallets that interacted from ANY of these captured IPs
      if (capturedIps.size > 0) {
        const ipList = Array.from(capturedIps);
        const [ipSess, ipTxs] = await Promise.all([
          supabase.from('paj_sessions').select('wallet_address, email, ip_address').in('ip_address', ipList),
          supabase.from('p2p_transactions').select('user_address, user_email, ip_address').in('ip_address', ipList),
        ]);

        const otherWallets = new Set();
        for (const r of (ipSess.data || [])) {
          if (r.wallet_address) otherWallets.add(r.wallet_address);
        }
        for (const r of (ipTxs.data || [])) {
          if (r.user_address) otherWallets.add(r.user_address);
        }

        result.correlatedWallets = Array.from(otherWallets);
      }
    }

    // If query by IP
    if (queryIp) {
      const [ipSess, ipTxs] = await Promise.all([
        supabase.from('paj_sessions').select('wallet_address, email, user_agent, updated_at').eq('ip_address', queryIp),
        supabase.from('p2p_transactions').select('user_address, user_email, user_agent, created_at').eq('ip_address', queryIp),
      ]);

      const wallets = new Set();
      const emails = new Set();
      for (const r of (ipSess.data || [])) {
        if (r.wallet_address) wallets.add(r.wallet_address);
        if (r.email) emails.add(r.email);
      }
      for (const r of (ipTxs.data || [])) {
        if (r.user_address) wallets.add(r.user_address);
        if (r.user_email) emails.add(r.user_email);
      }

      result.ipDetails = {
        ip: queryIp,
        matchedWallets: Array.from(wallets),
        matchedEmails: Array.from(emails),
        sessionRecords: ipSess.data || [],
        transactionRecords: ipTxs.data || [],
      };
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
