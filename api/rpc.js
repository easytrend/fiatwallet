/**
 * api/rpc.js — Vercel Serverless Function
 *
 * Proxies Solana JSON-RPC requests to authenticated Helius RPC without exposing
 * the API key to client browsers or mobile devices.
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

function getBackendRpcUrl() {
  if (process.env.HELIUS_RPC_URL && process.env.HELIUS_RPC_URL.trim()) {
    return process.env.HELIUS_RPC_URL.trim();
  }
  const key = extractHeliusKey();
  if (key) {
    return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`;
  }
  if (process.env.VITE_RPC_URL && process.env.VITE_RPC_URL.trim()) {
    return process.env.VITE_RPC_URL.trim();
  }
  if (process.env.RPC_URL && process.env.RPC_URL.trim()) {
    return process.env.RPC_URL.trim();
  }
  return 'https://solana-rpc.publicnode.com';
}

export default async function handler(req, res) {
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
    const rpcUrl = getBackendRpcUrl();
    const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    const rpcResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload,
    });

    const data = await rpcResponse.json();
    return res.status(rpcResponse.status).json(data);
  } catch (err) {
    console.error('[api/rpc] RPC proxy error:', err);
    return res.status(500).json({ error: 'RPC proxy error: ' + err.message });
  }
}
