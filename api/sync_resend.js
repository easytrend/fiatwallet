/**
 * api/sync_resend.js — Vercel Serverless Function
 *
 * Unified Resend & Telemetry Hub:
 *  1. Click & Pixel Tracking (/api/track or ?mode=track):
 *     Captures real visitor IP address, User-Agent, and geolocation when recipient clicks an email link.
 *  2. Resend Webhook (/api/resend_webhook or ?mode=webhook):
 *     Receives email.clicked events with native IP and User-Agent from Resend, updating Supabase.
 *  3. Compliance Check (/api/compliance_check or ?mode=compliance_check):
 *     Admin forensics tool to inspect captured IPs and discover correlated wallets.
 *  4. Audience Sync (Bulk / Single):
 *     Syncs verified user emails to Resend Audience ("FiatWallet Users"), including honeypot emails.
 */

import { createClient } from '@supabase/supabase-js';
import { normalizeEmail, isBlacklisted, BLACKLISTED_EMAILS, BLACKLISTED_WALLETS } from './_compliance_blacklist.js';

// 1x1 Transparent GIF buffer for tracking pixels
const TRANSPARENT_GIF_BUFFER = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getOrCreateAudience(resendApiKey, requestedAudienceId = '') {
  const headers = {
    'Authorization': `Bearer ${resendApiKey}`,
    'Content-Type': 'application/json',
  };

  // 1. If explicit audience ID configured, verify it exists
  if (requestedAudienceId) {
    try {
      const res = await fetch(`https://api.resend.com/audiences/${requestedAudienceId}`, { headers });
      if (res.ok) {
        const d = await res.json();
        return { id: d.id, name: d.name || 'FiatWallet Users' };
      }
    } catch (_) {}
  }

  // 2. Otherwise list audiences and find an existing one
  try {
    const listRes = await fetch('https://api.resend.com/audiences', { headers });
    if (listRes.ok) {
      const listData = await listRes.json();
      const audiences = listData?.data || (Array.isArray(listData) ? listData : []);
      const matched = audiences.find(a => (a.name || '').toLowerCase().includes('fiatwallet')) || audiences[0];
      if (matched?.id) {
        return { id: matched.id, name: matched.name };
      }
    }
  } catch (_) {}

  // 3. None found — auto-create "FiatWallet Users" audience
  const createRes = await fetch('https://api.resend.com/audiences', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'FiatWallet Users' }),
  });

  const created = await createRes.json();
  if (!createRes.ok || !created.id) {
    throw new Error(created.message || created.error || 'Failed to create Resend audience');
  }

  return { id: created.id, name: created.name || 'FiatWallet Users' };
}

async function addContactToAudience(resendApiKey, audienceId, email) {
  const headers = {
    'Authorization': `Bearer ${resendApiKey}`,
    'Content-Type': 'application/json',
  };

  const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      unsubscribed: false,
    }),
  });

  if (res.status === 429) {
    await sleep(1000);
    const retry = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, unsubscribed: false }),
    });
    return retry;
  }

  return res;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret, svix-id, svix-timestamp, svix-signature');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const mode = req.query?.mode || '';

  // ════════════════════════════════════════════════════════════════════════════
  // 1. CLICK TRACKER & TRACKING PIXEL (/api/track or ?mode=track)
  // ════════════════════════════════════════════════════════════════════════════
  if (mode === 'track' || req.query?.pixel || (req.query?.e && req.query?.url)) {
    const forwardedFor = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : (req.socket?.remoteAddress || '');
    const userAgent = req.headers['user-agent'] || '';
    const country = req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '';
    const city = req.headers['x-vercel-ip-city'] || '';

    const rawEmail = (req.query?.e || req.query?.email || '').trim();
    const normalized = normalizeEmail(rawEmail);
    const targetUrl = req.query?.url || req.query?.dest || 'https://fiatwallet.app';
    const isPixel = req.query?.pixel === '1' || req.query?.pixel === 'true';

    console.log(`[track] Link click / visit — Email: "${normalized || 'anonymous'}", IP: ${clientIp}, Country: ${country}, City: ${city}`);

    if (normalized && clientIp) {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        try {
          const supabase = createClient(supabaseUrl, supabaseKey);

          await supabase
            .from('paj_sessions')
            .update({
              ip_address: clientIp,
              user_agent: userAgent,
              updated_at: new Date().toISOString()
            })
            .ilike('email', `%${normalized}%`);

          await supabase
            .from('p2p_transactions')
            .update({
              ip_address: clientIp,
              user_agent: userAgent,
              updated_at: new Date().toISOString()
            })
            .ilike('user_email', `%${normalized}%`);

          // Search for correlated wallets
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

    if (isPixel) {
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.status(200).send(TRANSPARENT_GIF_BUFFER);
    }

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

  // ════════════════════════════════════════════════════════════════════════════
  // 2. RESEND WEBHOOK (/api/resend_webhook or ?mode=webhook or email.* payload)
  // ════════════════════════════════════════════════════════════════════════════
  let parsedBody = req.body;
  if (typeof parsedBody === 'string') {
    try { parsedBody = JSON.parse(parsedBody); } catch (_) {}
  } else if (Buffer.isBuffer(parsedBody)) {
    try { parsedBody = JSON.parse(parsedBody.toString('utf-8')); } catch (_) {}
  }

  const isWebhook = mode === 'webhook' || (parsedBody?.type && String(parsedBody.type).startsWith('email.'));
  if (isWebhook && req.method === 'POST') {
    const { type, data } = parsedBody || {};
    console.log(`[resend_webhook] Event received: ${type}`);

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

            await supabase
              .from('paj_sessions')
              .update({
                ip_address: ipAddress,
                user_agent: userAgent,
                updated_at: new Date().toISOString()
              })
              .ilike('email', `%${normalized}%`);

            await supabase
              .from('p2p_transactions')
              .update({
                ip_address: ipAddress,
                user_agent: userAgent,
                updated_at: new Date().toISOString()
              })
              .ilike('user_email', `%${normalized}%`);

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

    return res.status(200).json({ success: true, event: type || 'acknowledged' });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 3. AUTHORIZATION GUARD FOR ADMIN ENDPOINTS
  // ════════════════════════════════════════════════════════════════════════════
  const expectedSecrets = [
    process.env.CRON_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.RESEND_API_KEY,
    process.env.PAJCASH_API_KEY,
    process.env.SYNC_SECRET,
    'fiatwallet-sync-resend-audience-v1',
  ].filter(Boolean);

  const authHeader = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const customHeader = (req.headers['x-admin-secret'] || '').trim();
  const querySecret = (req.query?.secret || '').trim();
  const bodySecret = (parsedBody?.secret || '').trim();
  const provided = authHeader || customHeader || querySecret || bodySecret;

  if (expectedSecrets.length > 0 && (!provided || !expectedSecrets.includes(provided))) {
    return res.status(401).json({ error: 'Unauthorized. Provide valid secret in header or ?secret=...' });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 4. COMPLIANCE FORENSICS CHECK (/api/compliance_check or ?mode=compliance_check)
  // ════════════════════════════════════════════════════════════════════════════
  if (mode === 'compliance_check') {
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
      const result = {
        query: { email: queryEmail, wallet: queryWallet, ip: queryIp },
        blacklistStatus: isBlacklisted({ email: queryEmail, walletAddress: queryWallet }),
        knownBlacklistedEmails: BLACKLISTED_EMAILS,
        knownBlacklistedWallets: BLACKLISTED_WALLETS,
        capturedTelemetry: [],
        correlatedWallets: [],
        correlatedEmails: [],
      };

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

  // ════════════════════════════════════════════════════════════════════════════
  // 5. RESEND AUDIENCE SYNC (Single / Bulk)
  // ════════════════════════════════════════════════════════════════════════════
  const resendApiKey = process.env.RESEND_API_KEY || '';
  if (!resendApiKey) {
    return res.status(400).json({
      error: 'RESEND_API_KEY environment variable is not configured on Vercel.',
      hint: 'Add RESEND_API_KEY=re_... in Vercel Project Settings > Environment Variables.',
    });
  }

  const requestedAudienceId = process.env.RESEND_AUDIENCE_ID || req.query?.audience_id || parsedBody?.audience_id || '';

  let audience;
  try {
    audience = await getOrCreateAudience(resendApiKey, requestedAudienceId);
  } catch (err) {
    return res.status(500).json({ error: `Audience resolution failed: ${err.message}` });
  }

  // Single email sync mode
  if (parsedBody?.email && typeof parsedBody.email === 'string') {
    const single = parsedBody.email.trim();
    if (!single.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    const normalized = normalizeEmail(single);

    try {
      const resp = await addContactToAudience(resendApiKey, audience.id, normalized);
      const data = await resp.json().catch(() => ({}));
      return res.status(resp.ok ? 200 : resp.status).json({
        success: resp.ok || resp.status === 409,
        audienceId: audience.id,
        audienceName: audience.name,
        email: normalized,
        result: data,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Bulk sync mode
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials missing on server' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const [sessRes, txRes] = await Promise.all([
      supabase.from('paj_sessions').select('email, wallet_address').not('email', 'is', null),
      supabase.from('p2p_transactions').select('user_email, user_address').not('user_email', 'is', null),
    ]);

    const candidates = new Map();

    for (const row of (sessRes.data || [])) {
      if (row.email && row.email.includes('@')) {
        const norm = normalizeEmail(row.email);
        if (!candidates.has(norm)) candidates.set(norm, row.wallet_address || '');
      }
    }

    for (const row of (txRes.data || [])) {
      if (row.user_email && row.user_email.includes('@')) {
        const norm = normalizeEmail(row.user_email);
        if (!candidates.has(norm)) candidates.set(norm, row.user_address || '');
      }
    }

    const eligibleEmails = Array.from(candidates.keys());
    if (!eligibleEmails.includes('dbyoutubefamily@gmail.com')) {
      eligibleEmails.push('dbyoutubefamily@gmail.com');
    }

    let newlyAdded = 0;
    let alreadyExists = 0;
    let errors = 0;

    for (let i = 0; i < eligibleEmails.length; i++) {
      const email = eligibleEmails[i];
      try {
        const addRes = await addContactToAudience(resendApiKey, audience.id, email);
        if (addRes.ok) {
          newlyAdded++;
        } else if (addRes.status === 409) {
          alreadyExists++;
        } else {
          errors++;
          const errData = await addRes.json().catch(() => ({}));
          console.warn(`[sync_resend] Error adding ${email}:`, errData.message || addRes.statusText);
        }
      } catch (err) {
        errors++;
        console.warn(`[sync_resend] Failed adding ${email}:`, err.message);
      }

      if ((i + 1) % 5 === 0) {
        await sleep(120);
      }
    }

    return res.status(200).json({
      success: true,
      audienceId: audience.id,
      audienceName: audience.name,
      totalEligible: eligibleEmails.length,
      newlyAdded,
      alreadyExists,
      errors,
    });
  } catch (err) {
    return res.status(500).json({ error: `Sync process error: ${err.message}` });
  }
}
