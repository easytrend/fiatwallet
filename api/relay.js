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
const ATA_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const LIGHTHOUSE_PROGRAM_ID = 'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95'; // Phantom & Solana wallet assertion guard

const ALLOWED_RELAY_PROGRAMS = new Set([
  SYSTEM_PROGRAM_ID,
  'ComputeBudget111111111111111111111111111111',
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  ATA_PROGRAM_ID,
  LIGHTHOUSE_PROGRAM_ID,
  'AddressLookupTab1e1111111111111111111111111',
  'Ed25519SigVerify111111111111111111111111111',
  'Secp256k1SigVerify1111111111111111111111111',
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
function validateRelayerNotDrained(instructions, relayerPubkey, isWhitelistedGasless = false, validOfframpDepositAddress = null) {
  for (const ix of instructions) {
    const progId = typeof ix.programId === 'string' ? ix.programId : ix.programId.toBase58();

    // 0. Strict Program Whitelist:
    // Only standard Solana runtime programs (ComputeBudget, Memo, Token, Token-2022, ATA, SystemProgram)
    // are permitted in relayed transactions. Any unknown/third-party contract is rejected immediately.
    if (!ALLOWED_RELAY_PROGRAMS.has(progId)) {
      return `Blocked: Unauthorized program in relay transaction (${progId})`;
    }

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
    // Only valid transfer opcodes (3 = Transfer, 12 = TransferChecked) are permitted.
    if (TOKEN_PROGRAMS.has(progId)) {
      for (let k = 0; k < ix.keys.length; k++) {
        const keyMeta = ix.keys[k];
        if (keyMeta.pubkey.equals(relayerPubkey)) {
          return `Blocked: relayer cannot appear in any Token program instruction (index ${k})`;
        }
      }
      if (ix.data && ix.data.length > 0) {
        const opcode = ix.data[0];
        if (opcode !== 3 && opcode !== 12) {
          return `Blocked: Disallowed token instruction opcode: ${opcode}`;
        }
      }
    }

    // 3. Associated Token Account Program:
    // Relayer must NEVER be the target wallet (keys[2]) or mint!
    // Relayer can ONLY fund ATA rent if:
    //   a) The user is an explicitly whitelisted gasless wallet, OR
    //   b) The target wallet is the verified PajCash deposit address for a genuine offramp order!
    if (progId === ATA_PROGRAM_ID) {
      if (ix.keys.length >= 3 && ix.keys[2].pubkey.equals(relayerPubkey)) {
        return 'Blocked: relayer cannot be the target wallet of an ATA creation instruction';
      }
      if (ix.keys.length >= 1 && ix.keys[0].pubkey.equals(relayerPubkey)) {
        const targetWallet = ix.keys.length >= 3 ? (typeof ix.keys[2].pubkey === 'string' ? ix.keys[2].pubkey : ix.keys[2].pubkey.toBase58()) : '';
        const isAuthorizedOfframpATA = Boolean(validOfframpDepositAddress && targetWallet === validOfframpDepositAddress);
        if (!isWhitelistedGasless && !isAuthorizedOfframpATA) {
          return 'Blocked: relayer is not permitted to sponsor ATA creation rent for unauthorized recipient';
        }
      }
    }

    // 4. ComputeBudget & Memo: relayer must never appear as an account parameter
    if (progId !== ATA_PROGRAM_ID && progId !== SYSTEM_PROGRAM_ID) {
      for (let k = 0; k < ix.keys.length; k++) {
        if (ix.keys[k].pubkey.equals(relayerPubkey)) {
          return `Blocked: relayer cannot appear in instruction accounts for ${progId}`;
        }
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

    // ── Identify User Signer & Check Gasless Whitelist ───────────────────────
    let userWalletStr = '';
    if (isVersioned) {
      const userPk = transaction.message.staticAccountKeys.find((k, idx) => {
        return !k.equals(relayerKp.publicKey) && transaction.message.isAccountSigner(idx);
      });
      userWalletStr = userPk ? userPk.toBase58() : '';
    } else {
      const userSigner = transaction.signatures.find(s => s.publicKey && !s.publicKey.equals(relayerKp.publicKey));
      userWalletStr = userSigner?.publicKey ? userSigner.publicKey.toBase58() : '';
    }

    // CRITICAL SECURITY CHECK: A relayed transaction MUST have a user signature!
    // The relayer sponsors fees for genuine user transactions, never unauthenticated or bot-crafted transactions.
    if (!userWalletStr) {
      return res.status(400).json({ error: 'Transaction rejected: Missing required user signature' });
    }

    const isWhitelistedGasless = Boolean(userWalletStr && GASLESS_WHITELISTED_WALLETS.has(userWalletStr));

    // ── Parse and Strictly Verify Memo Instruction ───────────────────────────
    // To prevent memo trickery (multiple memos, trailing spoof data, spoofed gasless headers),
    // a valid relayed transaction MUST contain EXACTLY ONE memo instruction.
    const memoInstructions = instructions.filter(ix => {
      const progId = typeof ix.programId === 'string' ? ix.programId : ix.programId.toBase58();
      return progId === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' ||
             progId === 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo';
    });

    if (memoInstructions.length !== 1) {
      return res.status(400).json({ error: 'Transaction rejected: Transaction must contain exactly one memo instruction' });
    }

    const memoIx = memoInstructions[0];
    const decoder = new TextDecoder();
    let rawMemoText = '';
    try {
      rawMemoText = decoder.decode(memoIx.data).trim();
    } catch {
      return res.status(400).json({ error: 'Transaction rejected: Malformed memo data' });
    }

    // Strict memo format patterns (no extra prefixes, suffixes, spaces, or colons)
    const OFFRAMP_MEMO_REGEX = /^fiatwallet:pajcash:offramp:([a-zA-Z0-9_-]{8,64})$/;
    const GASLESS_MEMO_REGEX = /^fiatwallet:send:(USDC|USDT):([1-9A-HJ-NP-Za-km-z]{32,44})$/;

    let isOfframp = false;
    let isGaslessSend = false;
    let memoOrderId = '';

    const offrampMatch = rawMemoText.match(OFFRAMP_MEMO_REGEX);
    const gaslessMatch = rawMemoText.match(GASLESS_MEMO_REGEX);

    if (offrampMatch) {
      isOfframp = true;
      memoOrderId = offrampMatch[1];
    } else if (gaslessMatch && isWhitelistedGasless) {
      isGaslessSend = true;
    } else {
      if (isWhitelistedGasless) {
        return res.status(400).json({ error: 'Gasless transaction memo must match fiatwallet:send:<TOKEN>:<RECIPIENT>' });
      }
      return res.status(400).json({ error: 'Transaction rejected: Unrecognized or malformed memo format' });
    }

    // ── Supabase & Strict Offramp Verification ────────────────────────────────
    let userEmail = '';
    let supabase = null;
    let validOfframpDepositAddress = null;
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      try {
        supabase = createClient(supabaseUrl, supabaseKey);
      } catch (e) {
        console.warn('[relay] Supabase init warning:', e.message);
      }
    }

    if (isOfframp) {
      if (!supabase) {
        return res.status(503).json({ error: 'Database service configuration missing for offramp verification' });
      }

      // Reject known exploit order IDs
      if (memoOrderId === 'atafarm' || memoOrderId === 'test' || memoOrderId.length < 8) {
        return res.status(400).json({ error: 'Invalid or forged offramp orderId in memo' });
      }

      let orderRow = null;
      if (supabase) {
        const { data: dbRow, error: orderErr } = await supabase
          .from('p2p_transactions')
          .select('order_id, status, user_email, user_address, deposit_address, signature, created_at')
          .eq('order_id', memoOrderId)
          .maybeSingle();
        if (dbRow) orderRow = dbRow;
      }

      // Fallback: If not found in database (e.g. slight replication delay or network glitch), verify directly with PajCash API
      if (!orderRow) {
        const candidateTokens = [];
        if (supabase && userWalletStr) {
          try {
            const { data: userSess } = await supabase
              .from('paj_sessions')
              .select('session_token')
              .eq('wallet_address', userWalletStr)
              .order('updated_at', { ascending: false })
              .limit(1);
            if (userSess && userSess[0]?.session_token) {
              candidateTokens.push(userSess[0].session_token);
            }
          } catch {}
        }
        const pajApiKey = process.env.VITE_PAJCASH_API_KEY || process.env.PAJCASH_API_KEY;
        if (pajApiKey && !candidateTokens.includes(pajApiKey)) candidateTokens.push(pajApiKey);

        const baseUrls = ['https://api.paj.cash', 'https://api-staging.paj.cash'];
        for (const token of candidateTokens) {
          for (const baseUrl of baseUrls) {
            try {
              const resp = await fetch(`${baseUrl}/pub/transactions/${memoOrderId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
              });
              if (resp.ok) {
                const pajData = await resp.json();
                const matchedId = pajData.id || pajData._id || pajData.orderId;
                if (matchedId === memoOrderId && pajData.address) {
                  orderRow = {
                    order_id: memoOrderId,
                    status: pajData.status || 'INIT',
                    user_email: pajData.userEmail || pajData.email || null,
                    user_address: userWalletStr,
                    deposit_address: pajData.address,
                    signature: `pending_p2p_offramp_${memoOrderId}`,
                    created_at: pajData.createdAt || new Date().toISOString(),
                  };
                  if (supabase) {
                    supabase.from('p2p_transactions').insert({
                      signature: `pending_p2p_offramp_${memoOrderId}`,
                      user_address: userWalletStr,
                      order_id: memoOrderId,
                      transaction_type: 'p2p_offramp',
                      token_symbol: pajData.currency || 'USDC',
                      crypto_amount: parseFloat(pajData.amount) || 0,
                      fiat_currency: pajData.fiatCurrency || 'NGN',
                      fiat_amount: parseFloat(pajData.fiatAmount) || 0,
                      status: 'INIT',
                      deposit_address: pajData.address,
                      user_email: pajData.userEmail || pajData.email || null,
                    }).then(() => {}).catch(() => {});
                  }
                  break;
                }
              }
            } catch (err) {
              console.warn('[relay] PajCash fallback lookup error:', err.message);
            }
          }
          if (orderRow) break;
        }
      }

      if (!orderRow) {
        return res.status(403).json({ error: 'Offramp order not found in database. Forged or unrecorded orders are rejected.' });
      }

      // 1. Status Check: Reject completed, cancelled, or compliance-held orders
      const currentStatus = (orderRow.status || '').toUpperCase();
      if (['COMPLETED', 'FORWARDED_SUCCESS', 'CANCELLED', 'EXPIRED', 'FAILED', 'HELD_COMPLIANCE_REVIEW'].includes(currentStatus)) {
        return res.status(400).json({ error: `Offramp order already finalized or restricted (${currentStatus})` });
      }

      // 2. Expiration Check: PajCash offramp orders expire after 45 minutes
      if (orderRow.created_at) {
        const orderAgeMs = Date.now() - new Date(orderRow.created_at).getTime();
        if (orderAgeMs > 45 * 60 * 1000) {
          return res.status(400).json({ error: 'Offramp order has expired (orders are only valid for 45 minutes)' });
        }
      }

      // 3. Replay Protection: Reject if deposit tx has already been submitted
      if (orderRow.signature && !orderRow.signature.startsWith('pending_') && orderRow.signature.length >= 44) {
        return res.status(400).json({ error: 'Offramp order deposit transaction has already been submitted on-chain' });
      }

      // 4. Signer Binding Check:
      // The user wallet that signed this transaction MUST be the exact wallet that registered the order
      if (orderRow.user_address && orderRow.user_address.trim() !== userWalletStr) {
        return res.status(403).json({ error: 'Signer wallet does not match registered order user_address' });
      }
      // 4a. Cross-check against authenticated user session
      if (orderRow.user_email && supabase) {
        try {
          const { data: sessRows } = await supabase
            .from('paj_sessions')
            .select('wallet_address')
            .ilike('email', orderRow.user_email.trim());
          if (sessRows && sessRows.length > 0) {
            const authorizedWallets = sessRows.map(s => s.wallet_address).filter(Boolean);
            if (authorizedWallets.length > 0 && !authorizedWallets.includes(userWalletStr)) {
              return res.status(403).json({ error: 'Signer wallet is not bound to the registered user session' });
            }
          }
        } catch (e) {
          console.warn('[relay] Session cross-check notice:', e.message);
        }
      }

      if (orderRow.user_email) userEmail = orderRow.user_email;

      // 4. Deposit Address Binding Check:
      // The transaction accounts MUST contain the registered PajCash deposit address
      if (!orderRow.deposit_address) {
        return res.status(400).json({ error: 'Order is missing verified deposit_address in database' });
      }
      validOfframpDepositAddress = orderRow.deposit_address.trim();

      const allTxKeys = isVersioned
        ? transaction.message.staticAccountKeys.map(k => k.toBase58())
        : transaction.instructions.flatMap(ix => ix.keys.map(k => k.pubkey.toBase58()));

      let depositAddressPresent = allTxKeys.includes(validOfframpDepositAddress);
      if (!depositAddressPresent) {
        // Also check if any known/derived ATA for validOfframpDepositAddress is in allTxKeys
        try {
          const depPk = new PublicKey(validOfframpDepositAddress);
          const candidateMints = [
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
            'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
            '2b1kV6itusLRbbRdZdavAwDxfEydUqnmCuihYTdtpump', // USDG
          ];
          for (const m of candidateMints) {
            for (const prog of [new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')]) {
              const [ata] = PublicKey.findProgramAddressSync(
                [depPk.toBuffer(), prog.toBuffer(), new PublicKey(m).toBuffer()],
                new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
              );
              if (allTxKeys.includes(ata.toBase58())) {
                depositAddressPresent = true;
                break;
              }
            }
            if (depositAddressPresent) break;
          }
        } catch {}
      }

      if (!depositAddressPresent) {
        return res.status(400).json({ error: 'Transaction accounts do not include the registered order deposit address' });
      }

      // 5. Must have an actual token transfer instruction
      const hasTokenTransfer = instructions.some(ix => {
        const progId = typeof ix.programId === 'string' ? ix.programId : ix.programId.toBase58();
        return TOKEN_PROGRAMS.has(progId);
      });
      if (!hasTokenTransfer) {
        return res.status(400).json({ error: 'Offramp transaction must include a token transfer instruction' });
      }
    }

    // ── Drain Check (with Program Whitelist, Relayer Immunity, and ATA Recipient Binding) ─
    const drainCheck = validateRelayerNotDrained(instructions, relayerKp.publicKey, isWhitelistedGasless, validOfframpDepositAddress);
    if (drainCheck) {
      return res.status(400).json({ error: drainCheck });
    }

    // ── Structural bounds ─────────────────────────────────────────────────────
    if (instructions.length > 20) {
      return res.status(400).json({ error: 'Transaction exceeds maximum instruction count' });
    }

    const ataInstructions = instructions.filter(ix => {
      const progId = typeof ix.programId === 'string' ? ix.programId : ix.programId.toBase58();
      return progId === ATA_PROGRAM_ID;
    });
    if (ataInstructions.length > 1) {
      return res.status(400).json({ error: 'At most one ATA creation instruction allowed' });
    }

    // ── Check Compliance Blacklist ───────────────────────────────────────────
    if (supabase && !userEmail && userWalletStr) {
      try {
        const { data: sessionData } = await supabase
          .from('paj_sessions')
          .select('email')
          .eq('wallet_address', userWalletStr)
          .order('updated_at', { ascending: false })
          .limit(1);
        if (sessionData && sessionData[0]?.email) userEmail = sessionData[0].email;
      } catch (e) {
        console.warn('[relay] Supabase session lookup warning:', e.message);
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
      'https://mainnet.helius-rpc.com/?api-key=60eeee23-d073-4619-a5cd-14bff9d27873',
      process.env.VITE_RPC_URL,
      process.env.RPC_URL,
      'https://solana-rpc.publicnode.com',
      'https://rpc.ankr.com/solana',
      'https://api.mainnet-beta.solana.com',
    ].filter(Boolean);
    const uniqueRpcUrls = [...new Set(candidateRpcUrls)];

    const primaryConnection = new Connection(uniqueRpcUrls[0], 'confirmed');

    let relayerBalance = 0;
    for (const rpc of uniqueRpcUrls) {
      try {
        const c = (rpc === uniqueRpcUrls[0]) ? primaryConnection : new Connection(rpc, 'confirmed');
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

    for (const rpc of uniqueRpcUrls) {
      try {
        const c = (rpc === uniqueRpcUrls[0]) ? primaryConnection : new Connection(rpc, 'confirmed');
        try {
          sig = await c.sendRawTransaction(rawWireTx, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3,
          });
        } catch (simErr) {
          console.warn(`[relay] Preflight simulation on ${rpc} failed, retrying with skipPreflight: true:`, simErr.message);
          sig = await c.sendRawTransaction(rawWireTx, {
            skipPreflight: true,
            maxRetries: 3,
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
