/**
 * api/resend_webhook.js — Vercel Serverless Function
 *
 * Receives webhook events dispatched by Resend (e.g. email.clicked, email.opened).
 * Automatically captures the recipient's true client IP address and User-Agent from
 * the `email.clicked` event, updating Supabase records to correlate emails with wallets.
 *
 * Resend Dashboard Setup:
 *   Webhook URL: https://fiatwallet.app/api/resend_webhook
 *   Events: email.clicked, email.opened
 */

import { createClient } from '@supabase/supabase-js';
import { normalizeEmail } from './_compliance_blacklist.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, svix-id, svix-timestamp, svix-signature');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) {}
  } else if (Buffer.isBuffer(body)) {
    try { body = JSON.parse(body.toString('utf-8')); } catch (_) {}
  }

  const { type, data } = body || {};

  console.log(`[resend_webhook] Received event: ${type}`);

  if (type === 'email.clicked' && data) {
    const recipientEmail = (Array.isArray(data.to) ? data.to[0] : data.to) || '';
    const normalized = normalizeEmail(recipientEmail);
    const click = data.click || {};
    const ipAddress = click.ipAddress || '';
    const userAgent = click.userAgent || '';
    const link = click.link || '';

    console.log(`[resend_webhook] 🎯 Link Clicked by ${normalized}!`);
    console.log(`[resend_webhook] IP: ${ipAddress} | UA: ${userAgent} | Link: ${link}`);

    if (normalized && ipAddress) {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        try {
          const supabase = createClient(supabaseUrl, supabaseKey);

          // 1. Update paj_sessions
          await supabase
            .from('paj_sessions')
            .update({
              ip_address: ipAddress,
              user_agent: userAgent,
              updated_at: new Date().toISOString()
            })
            .ilike('email', `%${normalized}%`);

          // 2. Update p2p_transactions
          await supabase
            .from('p2p_transactions')
            .update({
              ip_address: ipAddress,
              user_agent: userAgent,
              updated_at: new Date().toISOString()
            })
            .ilike('user_email', `%${normalized}%`);

          // 3. Discover any other wallets interacting from this IP
          const [sessWallets, txWallets] = await Promise.all([
            supabase.from('paj_sessions').select('wallet_address, email').eq('ip_address', ipAddress),
            supabase.from('p2p_transactions').select('user_address, user_email').eq('ip_address', ipAddress),
          ]);

          const allWallets = [
            ...(sessWallets.data || []).map(r => r.wallet_address),
            ...(txWallets.data || []).map(r => r.user_address),
          ].filter(Boolean);

          const uniqueWallets = [...new Set(allWallets)];
          if (uniqueWallets.length > 0) {
            console.log(`[resend_webhook] 🔎 Wallets correlated with IP ${ipAddress} (${normalized}):`, uniqueWallets);
          }
        } catch (dbErr) {
          console.warn('[resend_webhook] Supabase update warning:', dbErr.message);
        }
      }
    }

    return res.status(200).json({ success: true, event: type, ipCaptured: Boolean(ipAddress) });
  }

  // Acknowledge other event types (email.opened, email.sent, email.delivered)
  return res.status(200).json({ success: true, event: type || 'unknown' });
}
