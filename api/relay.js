/**
 * api/relay.js — Vercel Serverless Function
 *
 * Receives a user-signed Solana transaction (serialized, base64),
 * validates it, adds the relayer's signature as feePayer, and broadcasts it.
 * Supports both legacy Transactions and VersionedTransactions (v0).
 *
 * Required server-side env vars (NO VITE_ prefix — never sent to browser):
 *   RELAYER_SECRET_KEY  — JSON array of 64 bytes, e.g. [12, 34, ...] OR Base58 private key string
 *   VITE_RPC_URL        — Optional custom RPC endpoint (reused from frontend env)
 */

import {
  Connection,
  Transaction,
  VersionedTransaction,
  Keypair,
  PublicKey,
} from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import { isBlacklisted, isBlacklistedEntityAsync } from './_compliance_blacklist.js';

// ── Programs that could drain the relayer's SOL/tokens if misused ────────────
// SystemProgram (SOL transfers) and Token programs (SPL transfers) are the only
// programs that can move funds. We don't block them — we inspect their instructions
// to ensure the relayer is never the SOURCE of a transfer.
const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
const TOKEN_PROGRAMS = new Set([
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022
]);

const MEMO_PREFIX = 'fiatwallet:pajcash:offramp:';

// Whitelisted wallets authorized for gasless transactions (relayer sponsors fee & rent)
const GASLESS_WHITELISTED_WALLETS = new Set([
  'HmMiQADnMniXTnFzBGr3691sGEUCrC4vHoTCRfiGR469',
  ...(process.env.GASLESS_WHITELISTED_WALLETS || process.env.VITE_GASLESS_WHITELISTED_WALLETS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
]);

// Zero-dependency Base58 Decoder
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

// Robust Keypair loader supporting both JSON array and Base58 string
function loadKeypair(secretEnv) {
  if (!secretEnv) throw new Error('RELAYER_SECRET_KEY env var is empty');
  let clean = secretEnv.trim();

  // Strip wrapping double quotes if present
  if (clean.startsWith('"') && clean.endsWith('"')) {
    clean = clean.slice(1, -1);
  }
  // Strip wrapping single quotes if present
  if (clean.startsWith("'") && clean.endsWith("'")) {
    clean = clean.slice(1, -1);
  }

  if (clean.startsWith('[')) {
    try {
      const arr = JSON.parse(clean);
      return Keypair.fromSecretKey(new Uint8Array(arr));
    } catch (e) {
      throw new Error(`Invalid JSON array format in RELAYER_SECRET_KEY: ${e.message}`);
    }
  }

  // Fallback to base58 decoding
  try {
    const bytes = decodeBase58(clean);
    return Keypair.fromSecretKey(bytes);
  } catch (e) {
    throw new Error('RELAYER_SECRET_KEY is neither a valid JSON array nor a valid Base58 string');
  }
}

/**
 * Extracts instructions uniformly from either a legacy Transaction or VersionedTransaction.
 */
function extractInstructions(transaction, isVersioned) {
  if (!isVersioned) return transaction.instructions || [];
  const staticKeys = transaction.message.staticAccountKeys;
  return transaction.message.compiledInstructions.map(ix => ({
    programId: staticKeys[ix.programIdIndex],
    keys: ix.accountKeyIndexes.map(idx => ({
      pubkey: staticKeys[idx],
      isSigner: transaction.message.isAccountSigner(idx),
      isWritable: transaction.message.isAccountWritable(idx),
    })),
    data: Buffer.from(ix.data),
  }));
}

/**
 * Checks that the relayer's public key is never used as the SOURCE of any
 * fund transfer. This prevents a malicious user from crafting a transaction
 * that drains the relayer's SOL or tokens while using it as the fee payer.
 */
function validateRelayerNotDrained(instructions, relayerPubkey) {
  for (const ix of instructions) {
    const progId = typeof ix.programId === 'string' ? ix.programId : ix.programId.toBase58();

    // 1. SystemProgram: The relayer must NEVER appear as a writable or signer account in ANY SystemProgram instruction.
    if (progId === SYSTEM_PROGRAM_ID) {
      for (let k = 0; k < ix.keys.length; k++) {
        const keyMeta = ix.keys[k];
        if (keyMeta.pubkey.equals(relayerPubkey) && (keyMeta.isWritable || keyMeta.isSigner)) {
          return `Blocked: relayer cannot be a writable or signer account in SystemProgram (index ${k})`;
        }
      }
      if (ix.data && ix.data.length >= 4) {
        const ixType = Buffer.isBuffer(ix.data)
          ? ix.data.readUInt32LE(0)
          : (ix.data[0] | (ix.data[1] << 8) | (ix.data[2] << 16) | (ix.data[3] << 24));
        if ([0, 1, 2, 3, 11].includes(ixType) && ix.keys.length > 0) {
          if (ix.keys[0].pubkey.equals(relayerPubkey)) {
            return `Blocked: relayer cannot be the source of SystemProgram instruction type ${ixType}`;
          }
        }
      }
    }

    // 2. Token Programs (SPL Token & Token-2022):
    // The relayer must NEVER appear in ANY Token Program instruction.
    if (TOKEN_PROGRAMS.has(progId)) {
      for (let k = 0; k < ix.keys.length; k++) {
        const keyMeta = ix.keys[k];
        if (keyMeta.pubkey.equals(relayerPubkey)) {
          return `Blocked: relayer cannot appear in any Token program instruction (index ${k})`;
        }
      }
    }

    // 3. Associated Token Account Program:
    // Only allow createIdempotent or create where relayer is payer (keys[0]).
    // Relayer must NEVER be the target wallet (keys[2]) or mint!
    if (progId === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL') {
      if (ix.keys.length >= 3 && ix.keys[2].pubkey.equals(relayerPubkey)) {
        return 'Blocked: relayer cannot be the target wallet of an ATA creation instruction';
      }
    }
  }
  return null; // Safe — no drain detected
}

export default async function handler(req, res) {
  // CORS headers for browser fetch
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Support GET check_whitelist endpoint
  if (req.method === 'GET') {
    const checkAddr = req.query?.check_whitelist;
    if (checkAddr) {
      const isWhitelisted = GASLESS_WHITELISTED_WALLETS.has(String(checkAddr).trim());
      return res.status(200).json({
        wallet: checkAddr,
        whitelisted: isWhitelisted,
        sponsoredTokens: ['USDC'],
        sponsorsRent: true,
      });
    }
    return res.status(200).json({ status: 'ok', service: 'fiatwallet-relay' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ── Load and parse relayer keypair ──────────────────────────────────────
    const relayerSecret = process.env.RELAYER_SECRET_KEY;
    if (!relayerSecret) {
      return res.status(503).json({ error: 'RELAYER_SECRET_KEY environment variable is not configured on Vercel' });
    }

    const relayerKp = loadKeypair(relayerSecret);

    // ── Parse request body robustly ─────────────────────────────────────────
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ error: 'Malformed JSON payload string' });
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        body = JSON.parse(body.toString('utf-8'));
      } catch (e) {
        return res.status(400).json({ error: 'Malformed JSON payload from Buffer' });
      }
    }

    const { serializedTransaction } = body || {};
    if (!serializedTransaction || typeof serializedTransaction !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid serializedTransaction parameter' });
    }

    // ── Deserialize transaction (support both legacy and VersionedTransaction) ─
    let transaction;
    let isVersioned = false;
    try {
      const txBuffer = Buffer.from(serializedTransaction, 'base64');
      try {
        transaction = Transaction.from(txBuffer);
      } catch (legacyErr) {
        transaction = VersionedTransaction.deserialize(txBuffer);
        isVersioned = true;
      }
    } catch (e) {
      return res.status(400).json({ error: 'Could not deserialize transaction: ' + e.message });
    }

    // ── Security validation ───────────────────────────────────────────────────

    // 1. feePayer must be the relayer
    const feePayer = isVersioned ? transaction.message.staticAccountKeys[0] : transaction.feePayer;
    if (!feePayer || !feePayer.equals(relayerKp.publicKey)) {
      return res.status(400).json({ error: 'Transaction feePayer does not match the relayer\'s public key' });
    }

    const instructions = extractInstructions(transaction, isVersioned);

    // 2. Ensure no instruction can drain the relayer's SOL or tokens
    const drainCheck = validateRelayerNotDrained(instructions, relayerKp.publicKey);
    if (drainCheck) {
      return res.status(400).json({ error: drainCheck });
    }

    // ── Identify User Signer & Check Gasless Whitelist ───────────────────────
    let userWalletStr = '';
    if (isVersioned) {
      const userPk = transaction.message.staticAccountKeys.find(k => !k.equals(relayerKp.publicKey));
      userWalletStr = userPk ? userPk.toBase58() : '';
    } else {
      const userSigner = transaction.signatures.find(s => s.publicKey && !s.publicKey.equals(relayerKp.publicKey));
      userWalletStr = userSigner?.publicKey ? userSigner.publicKey.toBase58() : '';
    }
    const isWhitelistedGasless = Boolean(userWalletStr && GASLESS_WHITELISTED_WALLETS.has(userWalletStr));

    // 3. Must have our memo to confirm it's a genuine offramp tx OR a whitelisted gasless send
    const decoder = new TextDecoder();
    let isOfframp = false;
    let isGaslessSend = false;
    let memoOrderId = '';

    for (const ix of instructions) {
      const progId = typeof ix.programId === 'string' ? ix.programId : ix.programId.toBase58();
      const isMemo =
        progId === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' ||
        progId === 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo';
      if (!isMemo) continue;
      try {
        const text = decoder.decode(ix.data);
        if (text.startsWith(MEMO_PREFIX)) {
          isOfframp = true;
          memoOrderId = text.replace(MEMO_PREFIX, '').trim();
          break;
        }
        if (isWhitelistedGasless && (text.startsWith('fiatwallet:send:USDC:') || text.startsWith('fiatwallet:send:'))) {
          isGaslessSend = true;
          break;
        }
      } catch {}
    }

    if (!isOfframp && !isGaslessSend) {
      if (isWhitelistedGasless) {
        return res.status(400).json({ error: 'Gasless transaction missing required fiatwallet:send memo' });
      }
      return res.status(400).json({ error: 'Transaction is missing required offramp memo' });
    }

    // 4. Structural integrity: Transactions have strict bounds
    if (instructions.length > 10) {
      return res.status(400).json({ error: 'Transaction exceeds maximum instruction count' });
    }

    const ataInstructions = instructions.filter(ix => {
      const progId = typeof ix.programId === 'string' ? ix.programId : ix.programId.toBase58();
      return progId === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
    });
    if (ataInstructions.length > 1) {
      return res.status(400).json({ error: 'At most one ATA creation instruction allowed' });
    }

    // ── Check Compliance Blacklist ───────────────────────────────────────────
    let userEmail = '';
    let supabase = null;
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      try {
        supabase = createClient(supabaseUrl, supabaseKey);
        if (memoOrderId) {
          const { data: orderRow } = await supabase
            .from('p2p_transactions')
            .select('user_email, user_address')
            .eq('order_id', memoOrderId)
            .maybeSingle();
          if (orderRow?.user_email) userEmail = orderRow.user_email;
        }
        if (!userEmail && userWalletStr) {
          const { data: sessionData } = await supabase
            .from('paj_sessions')
            .select('email')
            .eq('wallet_address', userWalletStr)
            .order('updated_at', { ascending: false })
            .limit(1);
          if (sessionData && sessionData[0]?.email) userEmail = sessionData[0].email;
        }
      } catch (e) {
        console.warn('[relay] Supabase query failed:', e.message);
      }
    }

    const offrampCheck = await isBlacklistedEntityAsync({ email: userEmail, walletAddress: userWalletStr, supabase });
    if (offrampCheck.blacklisted) {
      console.warn(`[relay] Blocked offramp for blacklisted entity (${offrampCheck.reason})`);
      return res.status(403).json({ error: 'Transaction rejected: Account is restricted for compliance review.' });
    }

    // ── Connect and check relayer SOL balance across candidate RPCs ──────────
    function extractHeliusKey() {
      if (process.env.HELIUS_API_KEY && process.env.HELIUS_API_KEY.trim()) return process.env.HELIUS_API_KEY.trim();
      const urls = [process.env.HELIUS_RPC_URL, process.env.VITE_RPC_URL, process.env.RPC_URL];
      for (const url of urls) {
        if (!url || typeof url !== 'string') continue;
        const match = url.match(/[?&]api-?key=([a-zA-Z0-9-]+)/i);
        if (match && match[1]) return match[1].trim();
      }
      return null;
    }

    const heliusKey = extractHeliusKey();
    const candidateRpcUrls = [
      process.env.HELIUS_RPC_URL,
      heliusKey ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(heliusKey)}` : null,
      process.env.VITE_RPC_URL,
      process.env.RPC_URL,
      'https://solana-rpc.publicnode.com',
      'https://rpc.ankr.com/solana',
      'https://api.mainnet-beta.solana.com',
    ].filter(Boolean);

    const primaryConnection = new Connection(candidateRpcUrls[0], 'confirmed');

    let relayerBalance = 0;
    for (const rpc of candidateRpcUrls) {
      try {
        const c = (rpc === candidateRpcUrls[0]) ? primaryConnection : new Connection(rpc, 'confirmed');
        relayerBalance = await c.getBalance(relayerKp.publicKey);
        break;
      } catch (e) {
        console.warn(`[relay] Could not fetch balance from ${rpc}:`, e.message);
      }
    }

    if (relayerBalance < 10_000) {
      return res.status(503).json({ error: `Relayer wallet has insufficient SOL (${(relayerBalance / 1e9).toFixed(5)} SOL). Please fund it.` });
    }

    // ── Sign as feePayer ─────────────────────────────────────────────────────
    let rawWireTx;
    if (isVersioned) {
      transaction.sign([relayerKp]);
      rawWireTx = transaction.serialize();
    } else {
      transaction.partialSign(relayerKp);
      rawWireTx = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
    }

    // ── Multi-RPC Broadcast ──────────────────────────────────────────────────
    let sig = null;
    let broadcastError = null;

    for (const rpc of candidateRpcUrls) {
      try {
        const c = (rpc === candidateRpcUrls[0]) ? primaryConnection : new Connection(rpc, 'confirmed');
        try {
          sig = await c.sendRawTransaction(rawWireTx, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });
        } catch (simErr) {
          console.warn(`[relay] Preflight simulation on ${rpc} failed, retrying with skipPreflight: true:`, simErr.message);
          sig = await c.sendRawTransaction(rawWireTx, {
            skipPreflight: true,
          });
        }
        if (sig) break;
      } catch (err) {
        broadcastError = err;
        console.warn(`[relay] Broadcast attempt on ${rpc} failed:`, err.message);
      }
    }

    if (!sig) {
      throw broadcastError || new Error('Transaction broadcast failed across all RPC endpoints.');
    }

    console.log(`[relay] Broadcasted tx successfully: ${sig}`);

    if (supabase && memoOrderId) {
      supabase
        .from('p2p_transactions')
        .update({
          signature: sig,
          updated_at: new Date().toISOString()
        })
        .eq('order_id', memoOrderId)
        .then(({ error: upErr }) => {
          if (upErr) console.warn('[relay] Supabase sig update note:', upErr.message);
        })
        .catch(() => {});
    }

    return res.status(200).json({ signature: sig });
  } catch (error) {
    console.error('[relay] Unhandled runtime crash:', error);
    return res.status(500).json({
      error: error.message || 'Internal Server Error',
      stack: error.stack
    });
  }
}
