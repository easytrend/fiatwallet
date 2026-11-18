/**
 * api/track.js — Vercel Serverless Function
 *
 * Captures visitor IP address, User-Agent, and geolocation (Country, City)
 * when an email recipient clicks a tracking link or opens an email with an embedded pixel.
 *
 * Usage:
 *  1. Click Tracker:
 *     https://fiatwallet.app/api/track?e=dbyoutubefamily@gmail.com&url=https://fiatwallet.app
 *     (Logs IP + UA, then 302 redirects user to target URL)
 *
 *  2. Tracking Pixel:
 *     <img src="https://fiatwallet.app/api/track?e=dbyoutubefamily@gmail.com&pixel=1" width="1" height="1" style="display:none;" />
 *     (Logs IP + UA, returns 1x1 transparent GIF)
 */

import { createClient } from '@supabase/supabase-js';
import { normalizeEmail } from './_compliance_blacklist.js';

// 1x1 Transparent GIF buffer
const TRANSPARENT_GIF_BUFFER = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Extract client metadata from request headers
  const forwardedFor = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
  const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : (req.socket?.remoteAddress || '');
  const userAgent = req.headers['user-agent'] || '';
  const country = req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '';
  const city = req.headers['x-vercel-ip-city'] || '';
  const region = req.headers['x-vercel-ip-country-region'] || '';

  const rawEmail = (req.query?.e || req.query?.email || req.body?.email || '').trim();
  const normalized = normalizeEmail(rawEmail);
  const targetUrl = req.query?.url || req.query?.dest || 'https://fiatwallet.app';
  const isPixel = req.query?.pixel === '1' || req.query?.pixel === 'true';

  console.log(`[track] Visit recorded — Email: "${normalized || 'anonymous'}", IP: ${clientIp}, Country: ${country}, City: ${city}`);

  // Async update to Supabase if email and IP are present
  if (normalized && clientIp) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Update paj_sessions
        await supabase
          .from('paj_sessions')
          .update({
            ip_address: clientIp,
            user_agent: userAgent,
            updated_at: new Date().toISOString()
          })
          .ilike('email', `%${normalized}%`);

        // 2. Update p2p_transactions
        await supabase
          .from('p2p_transactions')
          .update({
            ip_address: clientIp,
            user_agent: userAgent,
            updated_at: new Date().toISOString()
          })
          .ilike('user_email', `%${normalized}%`);

        // 3. Check for any wallets already linked to this IP address
        const { data: correlatedTxs } = await supabase
          .from('p2p_transactions')
          .select('user_address, user_email')
          .eq('ip_address', clientIp)
          .limit(10);

        if (correlatedTxs && correlatedTxs.length > 0) {
          const matchedWallets = [...new Set(correlatedTxs.map(t => t.user_address).filter(Boolean))];
          console.log(`[track] 🔍 Wallets correlated with IP ${clientIp}:`, matchedWallets);
        }
      } catch (dbErr) {
        console.warn('[track] Supabase logging error:', dbErr.message);
      }
    }
  }

  // If pixel request, serve the 1x1 GIF
  if (isPixel) {
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(200).send(TRANSPARENT_GIF_BUFFER);
  }

  // Otherwise redirect user to destination URL (with tracking params preserved)
  let destination = targetUrl;
  if (!destination.startsWith('http://') && !destination.startsWith('https://')) {
    destination = `https://fiatwallet.app${destination.startsWith('/') ? '' : '/'}${destination}`;
  }

  try {
    const parsed = new URL(destination);
    if (normalized) parsed.searchParams.set('utm_email', normalized);
    return res.redirect(302, parsed.toString());
  } catch (_) {
    return res.redirect(302, destination);
  }
}
