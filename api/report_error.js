/**
 * api/report_error.js — Vercel Serverless Function
 *
 * Receives frontend error reports, unhandled exceptions, and React crashes,
 * and relays them directly to the admin Telegram alert channel.
 */

import { sendTelegramAlert } from './_telegram.js';

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) {}
    }

    const { message, stack, url, wallet, component, fatal } = body || {};

    const clientIp = req.headers['cf-connecting-ip'] || 
                     req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    // Dispatch to Telegram
    await sendTelegramAlert({
      level: fatal ? 'CRITICAL' : 'WARNING',
      title: fatal ? 'Frontend Crash (White-Screen)' : 'Frontend Runtime Error',
      source: 'Fiatwallet App (Client)',
      message: message || 'Unspecified client error',
      details: {
        page: url || 'N/A',
        component: component || 'React Root',
        wallet: wallet || 'Not Connected',
        ip: clientIp || 'N/A',
        userAgent: userAgent.slice(0, 80),
        stackTrace: stack ? stack.slice(0, 300) : 'None',
      },
    });

    return res.status(200).json({ reported: true });
  } catch (err) {
    console.warn('[report_error] Exception handling report:', err.message);
    return res.status(200).json({ reported: false });
  }
}
