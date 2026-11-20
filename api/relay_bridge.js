/**
 * api/relay_bridge.js — Vercel Serverless Function
 *
 * Verifies a completed cross-chain bridge order from NEAR Intents (Chain Defuser),
 * checks that the tokens were delivered on-chain to the FiatWallet relayer,
 * deducts the 0.4% protocol fee ($0.10 minimum floor), and forwards the remaining
 * net tokens (SOL, USDT, or USDC) to the user's Solana address.
 */

import {
  Connection,
  Transaction,
  Keypair,
  PublicKey,
  TransactionInstruction,
  ComputeBudgetProgram,
  SystemProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
} from '@solana/spl-token';
import { createClient } from '@supabase/supabase-js';
import { isBlacklisted, isBlacklistedEntityAsync } from './_compliance_blacklist.js';

// Base58 Decoder
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
      throw new Error(`Invalid JSON array format: ${e.message}`);
    }
  }
  try {
    const bytes = decodeBase58(clean);
    return Keypair.fromSecretKey(bytes);
  } catch (e) {
    throw new Error('RELAYER_SECRET_KEY is neither a valid JSON array nor a valid Base58 string');
  }
}

const SPL_MINTS = {
  USDT: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
  USDC: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
};

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

function getBackendConnection() {
  const heliusKey = extractHeliusKey();
  const rpcUrl = process.env.HELIUS_RPC_URL || (heliusKey ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(heliusKey)}` : (process.env.VITE_RPC_URL || 'https://api.mainnet-beta.solana.com'));
  return new Connection(rpcUrl, 'confirmed');
}

async function ensureRelayerAtas(connection, relayerKp) {
  const results = {};
  const tokens = [
    { symbol: 'USDC', mint: SPL_MINTS.USDC },
    { symbol: 'USDT', mint: SPL_MINTS.USDT },
  ];

  for (const { symbol, mint } of tokens) {
    const ata = getAssociatedTokenAddressSync(mint, relayerKp.publicKey);
    try {
      const acc = await connection.getAccountInfo(ata);
      if (!acc) {
        console.log(`[relay_bridge] Relayer ${symbol} ATA missing (${ata.toBase58()}). Initializing...`);
        const tx = new Transaction();
        tx.add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }),
          createAssociatedTokenAccountIdempotentInstruction(
            relayerKp.publicKey,
            ata,
            relayerKp.publicKey,
            mint
          )
        );
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.feePayer = relayerKp.publicKey;
        tx.sign(relayerKp);
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
        await connection.confirmTransaction(sig, 'confirmed');
        console.log(`[relay_bridge] Relayer ${symbol} ATA initialized: ${sig}`);
        results[symbol] = { created: true, signature: sig, ata: ata.toBase58() };
      } else {
        results[symbol] = { created: false, exists: true, ata: ata.toBase58() };
      }
    } catch (e) {
      console.warn(`[relay_bridge] Error checking/creating ${symbol} ATA:`, e.message);
      results[symbol] = { error: e.message };
    }
  }
  return results;
}


async function executeForward({
  depositAddress,
  userAddress,
  destinationSymbol = 'USDT',
  relayerKp,
  supabase,
  nearApiKey,
}) {
  if (!supabase) {
    throw new Error('Database service configuration missing for bridge verification');
  }

  // 1. Resolve canonical bridge record from Supabase first
  const { data: dbBridge, error: dbError } = await supabase
    .from('bridge_transactions')
    .select('*')
    .eq('deposit_address', String(depositAddress))
    .maybeSingle();

  if (!dbBridge) {
    throw new Error(`Bridge order for deposit address ${depositAddress} not found in database. The bridge transaction must be initiated through FiatWallet.`);
  }

  if (!dbBridge.user_address) {
    throw new Error(`Bridge order ${depositAddress} does not have a verified user_address recorded. Cannot forward funds.`);
  }

  // Strictly enforce canonical destination wallet address from the database record!
  // Any userAddress supplied in the request body is verified against the database.
  const canonicalUserAddress = dbBridge.user_address.trim();
  if (userAddress && userAddress.trim() !== canonicalUserAddress) {
    console.warn(`[relay_bridge] userAddress in request (${userAddress}) does not match canonical dbBridge.user_address (${canonicalUserAddress}). Enforcing canonical address.`);
  }
  const effectiveUserAddress = canonicalUserAddress;

  let userPublicKey;
  try {
    userPublicKey = new PublicKey(effectiveUserAddress);
  } catch (err) {
    throw new Error('Invalid user Solana address: ' + effectiveUserAddress);
  }

  const effectiveDestinationSymbol = (dbBridge.destination_symbol || destinationSymbol || 'USDT').toUpperCase();

  // Return early if order is already completed, forwarded, or held in treasury
  const currentDbStatus = (dbBridge.status || '').toUpperCase();
  if (currentDbStatus === 'COMPLETED' || currentDbStatus === 'FORWARDED_SUCCESS') {
    return {
      signature: dbBridge.signature,
      alreadyForwarded: true,
      status: 'COMPLETED',
      message: 'Bridge payout already forwarded',
    };
  }

  if (currentDbStatus === 'HELD_COMPLIANCE_REVIEW') {
    return {
      status: 'HELD_COMPLIANCE_REVIEW',
      withheld: true,
      message: 'Bridge payout withheld in treasury for compliance review',
    };
  }

  // 2. Atomic claim lock: prevent concurrent double-payouts
  const { data: claimResult, error: claimError } = await supabase
    .from('bridge_transactions')
    .update({
      status: 'FORWARDING',
      updated_at: new Date().toISOString(),
    })
    .eq('deposit_address', String(depositAddress))
    .neq('status', 'FORWARDING')
    .neq('status', 'COMPLETED')
    .neq('status', 'FORWARDED_SUCCESS')
    .select('id');

  if (claimError) {
    throw new Error(`Failed to claim bridge order for forwarding: ${claimError.message}`);
  }

  if (!claimResult || claimResult.length === 0) {
    const { data: latestRow } = await supabase
      .from('bridge_transactions')
      .select('status, signature')
      .eq('deposit_address', String(depositAddress))
      .maybeSingle();

    if (latestRow?.status === 'COMPLETED' || latestRow?.status === 'FORWARDED_SUCCESS') {
      return {
        signature: latestRow.signature,
        alreadyForwarded: true,
        status: 'COMPLETED',
        message: 'Bridge payout already forwarded',
      };
    }

    return {
      error: 'Bridge order is already being processed or was forwarded.',
      alreadyForwarded: true,
    };
  }

  // 3. Verify status on NEAR Intents 1Click API
  const headers = {};
  if (nearApiKey) {
    headers['X-API-Key'] = nearApiKey;
    headers['Authorization'] = `Bearer ${nearApiKey}`;
  }

  let statusResp;
  try {
    statusResp = await fetch(`https://1click.chaindefuser.com/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`, {
      headers,
    });
  } catch (fetchErr) {
    // Revert lock back to PENDING on network error
    await supabase
      .from('bridge_transactions')
      .update({ status: 'PENDING', updated_at: new Date().toISOString() })
      .eq('deposit_address', String(depositAddress));
    throw new Error(`Could not connect to NEAR Intents API: ${fetchErr.message}`);
  }

  const statusData = await statusResp.json();
  const currentStatus = String(statusData.status || '').toUpperCase();
  if (currentStatus !== 'SUCCESS') {
    // Revert lock back to PENDING if cross-chain swap has not finalized yet
    await supabase
      .from('bridge_transactions')
      .update({ status: 'PENDING', updated_at: new Date().toISOString() })
      .eq('deposit_address', String(depositAddress));

    return {
      status: currentStatus || 'PENDING',
      error: `Bridge has not completed yet. Current status: ${currentStatus || 'PENDING'}`,
      pending: true,
    };
  }

  // 4. Verify recipient is our relayer
  const intentRecipient = statusData.quoteResponse?.quoteRequest?.recipient;
  if (intentRecipient && intentRecipient !== relayerKp.publicKey.toBase58()) {
    await supabase
      .from('bridge_transactions')
      .update({ status: 'FAILED', updated_at: new Date().toISOString() })
      .eq('deposit_address', String(depositAddress));
    throw new Error('Recipient mismatch: intent was not routed to the FiatWallet relayer');
  }

  // 5. Calculate gross amount & platform fee
  const grossStr = statusData.swapDetails?.amountOutFormatted || statusData.quoteResponse?.quote?.amountOutFormatted || '0';
  const grossAmount = parseFloat(grossStr);
  if (!grossAmount || grossAmount <= 0) {
    await supabase
      .from('bridge_transactions')
      .update({ status: 'PENDING', updated_at: new Date().toISOString() })
      .eq('deposit_address', String(depositAddress));
    throw new Error(`Invalid gross amount returned by bridge: ${grossStr}`);
  }

  const isNativeSol = effectiveDestinationSymbol === 'SOL';
  let platformFee = 0;
  if (isNativeSol) {
    platformFee = Math.max(0.001, Math.round(grossAmount * 0.004 * 10000) / 10000);
  } else {
    const rawFee = grossAmount * 0.004;
    platformFee = Math.max(0.10, Math.round(rawFee * 100) / 100);
  }

  const netAmount = Math.max(0, grossAmount - platformFee);

  // 6. Compliance Blacklist Guard
  const comp = await isBlacklistedEntityAsync({ walletAddress: effectiveUserAddress, supabase });
  if (comp.blacklisted) {
    console.warn(`[relay_bridge] User address ${effectiveUserAddress} is blacklisted (${comp.reason}). Withholding in treasury.`);
    await supabase
      .from('bridge_transactions')
      .update({
        status: 'HELD_COMPLIANCE_REVIEW',
        signature: `held_in_treasury_${depositAddress}`,
        updated_at: new Date().toISOString()
      })
      .eq('deposit_address', String(depositAddress));
    return {
      status: 'HELD_COMPLIANCE_REVIEW',
      reason: comp.reason,
      withheld: true
    };
  }

  // 7. Verify Relayer on-chain balance before building transaction
  const connection = getBackendConnection();
  const tokenMint = SPL_MINTS[effectiveDestinationSymbol];

  if (isNativeSol || !tokenMint) {
    const lamports = BigInt(Math.round(netAmount * 1_000_000_000));
    const relayerSol = await connection.getBalance(relayerKp.publicKey, 'confirmed').catch(() => 0);
    if (BigInt(relayerSol) < (lamports + 10_000n)) {
      await supabase
        .from('bridge_transactions')
        .update({ status: 'PENDING', updated_at: new Date().toISOString() })
        .eq('deposit_address', String(depositAddress));
      throw new Error(`Relayer SOL balance (${(relayerSol / 1e9).toFixed(4)} SOL) is insufficient for ${netAmount} SOL payout. Deposit may still be confirming on-chain.`);
    }
  } else {
    const decimals = 6;
    const units = BigInt(Math.round(netAmount * (10 ** decimals)));
    const relayerATA = getAssociatedTokenAddressSync(tokenMint, relayerKp.publicKey);
    let relayerTokenBal = 0n;
    try {
      const balResp = await connection.getTokenAccountBalance(relayerATA, 'confirmed');
      relayerTokenBal = BigInt(balResp.value.amount || '0');
    } catch (e) {}

    if (relayerTokenBal < units) {
      await supabase
        .from('bridge_transactions')
        .update({ status: 'PENDING', updated_at: new Date().toISOString() })
        .eq('deposit_address', String(depositAddress));
      throw new Error(`Relayer ${effectiveDestinationSymbol} balance (${relayerTokenBal} units) is insufficient to forward ${units} units (${netAmount} ${effectiveDestinationSymbol}). Deposit may still be in transit.`);
    }
  }

  // 8. Build Solana transaction
  const transaction = new Transaction();
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 150_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 })
  );

  if (isNativeSol || !tokenMint) {
    const lamports = BigInt(Math.round(netAmount * 1_000_000_000));
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: relayerKp.publicKey,
        toPubkey: userPublicKey,
        lamports,
      })
    );
  } else {
    const decimals = 6;
    const units = BigInt(Math.round(netAmount * (10 ** decimals)));
    const relayerATA = getAssociatedTokenAddressSync(tokenMint, relayerKp.publicKey);
    const userATA = getAssociatedTokenAddressSync(tokenMint, userPublicKey);

    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(
        relayerKp.publicKey,
        userATA,
        userPublicKey,
        tokenMint
      ),
      createTransferCheckedInstruction(
        relayerATA,
        tokenMint,
        userATA,
        relayerKp.publicKey,
        units,
        decimals
      )
    );
  }

  // Memo
  const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  transaction.add(
    new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(`fiatwallet:bridge-forward:${depositAddress.slice(0, 20)}`, 'utf-8'),
    })
  );

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = relayerKp.publicKey;
  transaction.sign(relayerKp);

  const sig = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  console.log(`[relay_bridge] Successfully forwarded ${netAmount} ${effectiveDestinationSymbol} to ${effectiveUserAddress}. Sig: ${sig}`);

  // 9. Update database record to COMPLETED
  const updatePayload = {
    status: 'COMPLETED',
    signature: sig,
    net_amount: netAmount,
    protocol_fee: platformFee,
    updated_at: new Date().toISOString(),
  };
  if (grossAmount) updatePayload.gross_amount = grossAmount;
  const actualDeposited = parseFloat(statusData.swapDetails?.depositedAmountFormatted || '0');
  if (actualDeposited > 0) updatePayload.deposit_amount = actualDeposited;

  await supabase
    .from('bridge_transactions')
    .update(updatePayload)
    .eq('deposit_address', String(depositAddress));

  return {
    signature: sig,
    netAmount,
    protocolFee: platformFee,
    status: 'COMPLETED',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const relayerSecret = process.env.RELAYER_SECRET_KEY;
  if (!relayerSecret) {
    return res.status(503).json({ error: 'RELAYER_SECRET_KEY missing on server' });
  }
  const relayerKp = loadKeypair(relayerSecret);

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;
  const nearApiKey = process.env.NEAR_INTENTS_API_KEY || process.env.VITE_NEAR_INTENTS_API_KEY || '';

  // 1. Auto-Sweep Mode (GET /api/relay_bridge?sweep=1 or POST { action: 'sweep' })
  // Sweeps pending bridge transactions in Supabase and forwards any completed deposits directly to users
  const isSweep = req.method === 'GET' || req.query?.sweep === '1' || req.body?.action === 'sweep' || req.query?.init_atas === '1';
  if (isSweep) {
    const connection = getBackendConnection();
    let ataInitResults = null;
    try {
      ataInitResults = await ensureRelayerAtas(connection, relayerKp);
    } catch (ataErr) {
      console.warn('[relay_bridge] ensureRelayerAtas error:', ataErr.message);
    }

    if (!supabase) {
      return res.status(200).json({ success: true, message: 'ATAs verified', ataInitResults });
    }
    try {
      const { data: pendingOrders, error: fetchErr } = await supabase
        .from('bridge_transactions')
        .select('deposit_address, user_address, destination_symbol, status')
        .in('status', ['PENDING', 'FORWARDING'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (fetchErr) throw fetchErr;

      const sweptResults = [];
      for (const order of (pendingOrders || [])) {
        try {
          const resForward = await executeForward({
            depositAddress: order.deposit_address,
            userAddress: order.user_address,
            destinationSymbol: order.destination_symbol || 'USDT',
            relayerKp,
            supabase,
            nearApiKey,
          });
          if (resForward?.status === 'COMPLETED' && resForward?.signature) {
            sweptResults.push({
              depositAddress: order.deposit_address,
              userAddress: order.user_address,
              signature: resForward.signature,
              netAmount: resForward.netAmount,
            });
          }
        } catch (itemErr) {
          console.warn(`[relay_bridge sweep] Order ${order.deposit_address} note:`, itemErr.message);
        }
      }

      return res.status(200).json({
        success: true,
        sweptCount: sweptResults.length,
        results: sweptResults,
        ataInitResults,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Sweep execution error' });
    }
  }

  // 2. Direct Single Forward Mode (POST /api/relay_bridge)
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { depositAddress, userAddress, destinationSymbol = 'USDT' } = req.body || {};

  if (!depositAddress || !userAddress) {
    return res.status(400).json({ error: 'Missing depositAddress or userAddress' });
  }

  try {
    const result = await executeForward({
      depositAddress,
      userAddress,
      destinationSymbol,
      relayerKp,
      supabase,
      nearApiKey,
    });

    if (result.pending) {
      return res.status(400).json({ error: result.error, status: result.status });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('[relay_bridge] Handler error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
