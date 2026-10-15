/**
 * api/history.js — Vercel Serverless Function
 *
 * Fetches indexed Solana transaction history for a wallet address via Helius Enhanced Transactions API.
 * Keeps Helius API key secure on the server side without exposing it to the browser.
 */

function extractHeliusKey() {
  if (process.env.HELIUS_API_KEY && process.env.HELIUS_API_KEY.trim()) {
    return process.env.HELIUS_API_KEY.trim();
  }
  const urls = [
    process.env.HELIUS_RPC_URL,
    process.env.VITE_RPC_URL,
    process.env.RPC_URL,
  ];
  for (const url of urls) {
    if (!url || typeof url !== 'string') continue;
    try {
      const parsed = new URL(url.trim());
      const key = parsed.searchParams.get('api-key') || parsed.searchParams.get('apiKey');
      if (key) return key.trim();
    } catch {}
    const match = url.match(/[?&]api-?key=([a-zA-Z0-9-]+)/i);
    if (match && match[1]) return match[1].trim();
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { address, limit = '30', before } = req.query;

  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid address parameter' });
  }

  const apiKey = extractHeliusKey();
  if (!apiKey) {
    return res.status(503).json({
      error: 'Helius API key not configured on server',
      fallback: true,
    });
  }

  try {
    let heliusUrl = `https://api-mainnet.helius-rpc.com/v0/addresses/${encodeURIComponent(address)}/transactions?api-key=${encodeURIComponent(apiKey)}&limit=${encodeURIComponent(limit)}`;
    if (before) {
      heliusUrl += `&before=${encodeURIComponent(before)}`;
    }

    const response = await fetch(heliusUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('[api/history] Helius API error:', response.status, errText);
      return res.status(response.status).json({
        error: `Helius API error: ${response.status}`,
        fallback: true,
      });
    }

    const data = await response.json();
    return res.status(200).json({
      success: true,
      source: 'helius_indexer',
      transactions: Array.isArray(data) ? data : [],
    });
  } catch (err) {
    console.error('[api/history] Exception fetching Helius transactions:', err);
    return res.status(500).json({
      error: err.message || 'Internal error fetching transactions',
      fallback: true,
    });
  }
}
