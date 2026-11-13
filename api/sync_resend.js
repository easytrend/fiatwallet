/**
 * api/sync_resend.js — Vercel Serverless Function
 *
 * Automatically syncs verified user emails from Supabase (paj_sessions & p2p_transactions)
 * to a Resend Audience ("FiatWallet Users") so you can send broadcast updates and product
 * announcements directly from Resend.
 *
 * Security:
 * Requires authorization header or query secret matching CRON_SECRET or SUPABASE_SERVICE_ROLE_KEY.
 *
 * Modes:
 *  - Bulk Sync: GET /api/sync_resend?secret=... (syncs all eligible Supabase user emails)
 *  - Single Sync: POST /api/sync_resend with { email: "user@example.com", secret: "..." }
 */

import { createClient } from '@supabase/supabase-js';
import { normalizeEmail, isBlacklisted } from './_compliance_blacklist.js';

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
    // Rate limit hit — backoff and retry once
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. Authorization check
  const expectedSecrets = [
    process.env.CRON_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.RESEND_API_KEY,
    process.env.PAJCASH_API_KEY,
  ].filter(Boolean);

  const authHeader = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const customHeader = (req.headers['x-admin-secret'] || '').trim();
  const querySecret = (req.query?.secret || '').trim();
  const bodySecret = (req.body?.secret || '').trim();
  const provided = authHeader || customHeader || querySecret || bodySecret;

  if (expectedSecrets.length > 0 && (!provided || !expectedSecrets.includes(provided))) {
    return res.status(401).json({ error: 'Unauthorized. Provide valid secret in header or ?secret=...' });
  }

  // 2. Resend API Key check
  const resendApiKey = process.env.RESEND_API_KEY || '';
  if (!resendApiKey) {
    return res.status(400).json({
      error: 'RESEND_API_KEY environment variable is not configured on Vercel.',
      hint: 'Add RESEND_API_KEY=re_... in Vercel Project Settings > Environment Variables.',
    });
  }

  const requestedAudienceId = process.env.RESEND_AUDIENCE_ID || req.query?.audience_id || req.body?.audience_id || '';

  // 3. Resolve Audience
  let audience;
  try {
    audience = await getOrCreateAudience(resendApiKey, requestedAudienceId);
  } catch (err) {
    return res.status(500).json({ error: `Audience resolution failed: ${err.message}` });
  }

  // 4. Single email sync mode
  if (req.body?.email && typeof req.body.email === 'string') {
    const single = req.body.email.trim();
    if (!single.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    const normalized = normalizeEmail(single);
    if (isBlacklisted({ email: normalized }).blacklisted) {
      return res.status(400).json({ error: 'Email flagged on compliance blacklist' });
    }

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

  // 5. Bulk sync mode: pull unique emails from Supabase
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

    const candidates = new Map(); // normalized email -> wallet address

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

    // Filter against compliance blacklist
    const eligibleEmails = [];
    for (const [email, wallet] of candidates.entries()) {
      if (!isBlacklisted({ email, walletAddress: wallet }).blacklisted) {
        eligibleEmails.push(email);
      }
    }

    let newlyAdded = 0;
    let alreadyExists = 0;
    let errors = 0;

    // Send in small batches with brief pause to stay well within Resend rate limits
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

      // 120ms pause between contacts avoids burst rate limiting
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
