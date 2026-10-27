/**
 * api/paj_config.js — Vercel Serverless Function
 *
 * Provides configured PajCash API credentials and Relayer public key to client applications
 * (including mobile APK) so users do not need individual email verification and the mobile
 * app can route onramp/offramp through the serverless relayer.
 */

import { Keypair } from '@solana/web3.js';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ALPHABET_MAP = {};
for (let i = 0; i < ALPHABET.length; i++) {
  ALPHABET_MAP[ALPHABET.charAt(i)] = i;
}

function decodeBase58(string) {
  if (string.length === 0) return new Uint8Array(0);
  const bytes = [0];
  for (let i = 0; i < string.length; i++) {
    const c = string.charAt(i);
    if (!(c in ALPHABET_MAP)) throw new Error('Non-base58 character');
    let carry = ALPHABET_MAP[c];
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let k = 0; string.charAt(k) === '1' && k < string.length - 1; k++) {
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

function loadKeypair(secretEnv) {
  if (!secretEnv) throw new Error('RELAYER_SECRET_KEY env var is empty');
  let clean = secretEnv.trim();
  if (clean.startsWith('"') && clean.endsWith('"')) clean = clean.slice(1, -1);
  if (clean.startsWith("'") && clean.endsWith("'")) clean = clean.slice(1, -1);

  if (clean.startsWith('[')) {
    try {
      const arr = JSON.parse(clean);
      return Keypair.fromSecretKey(new Uint8Array(arr));
    } catch (e) {
      throw new Error(`Invalid JSON array format in RELAYER_SECRET_KEY: ${e.message}`);
    }
  }

  try {
    const bytes = decodeBase58(clean);
    return Keypair.fromSecretKey(bytes);
  } catch (e) {
    throw new Error('RELAYER_SECRET_KEY is neither a valid JSON array nor a valid Base58 string');
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.VITE_PAJCASH_API_KEY || process.env.PAJCASH_API_KEY || '';
  const env = process.env.VITE_PAJCASH_ENV || process.env.PAJCASH_ENV || 'production';

  let relayerPublicKey = process.env.VITE_RELAYER_PUBLIC_KEY || '';
  if (!relayerPublicKey && process.env.RELAYER_SECRET_KEY) {
    try {
      const kp = loadKeypair(process.env.RELAYER_SECRET_KEY);
      relayerPublicKey = kp.publicKey.toBase58();
    } catch (e) {
      console.warn('Could not derive relayer public key:', e.message);
    }
  }

  const useOnrampRelayer = process.env.VITE_ONRAMP_USE_RELAYER === 'false'
    ? false
    : Boolean(relayerPublicKey);

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

  function resolveConfigRpcUrl() {
    if (process.env.HELIUS_RPC_URL && process.env.HELIUS_RPC_URL.trim()) {
      return process.env.HELIUS_RPC_URL.trim();
    }
    const heliusKey = extractHeliusKey();
    if (heliusKey) {
      return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(heliusKey)}`;
    }
    if (process.env.VITE_RPC_URL && process.env.VITE_RPC_URL.trim() && !process.env.VITE_RPC_URL.includes('publicnode.com')) {
      return process.env.VITE_RPC_URL.trim();
    }
    if (process.env.RPC_URL && process.env.RPC_URL.trim() && !process.env.RPC_URL.includes('publicnode.com')) {
      return process.env.RPC_URL.trim();
    }
    return 'https://fiatwallet.app/api/rpc';
  }

  const rpcUrl = resolveConfigRpcUrl();
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

  return res.status(200).json({
    apiKey,
    env,
    rpcUrl,
    relayerPublicKey,
    useOnrampRelayer,
    supabaseUrl,
    supabaseAnonKey,
  });
}

