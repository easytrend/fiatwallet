/**
 * api/leaderboard_claim.js — Vercel Serverless Function
 *
 * Implements the co-signed weekly reward claim for top rankers.
 * - Relayer Treasury authorizes SPL token transfer of Pullmeme ($PMEME).
 * - Claimer (User) is the Fee Payer (pays gas fee and ATA rent).
 * - Relayer spends 0 SOL.
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
} from '@solana/spl-token';
import { createClient } from '@supabase/supabase-js';

// Base58 Decoder
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Decode(str) {
  if (!str || typeof str !== 'string') return new Uint8Array(0);
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const value = ALPHABET.indexOf(c);
    if (value === -1) throw new Error(`Invalid base58 character '${c}'`);
    for (let j = 0; j < bytes.length; j++) {
      bytes[j] *= 58;
    }
    bytes[0] += value;
    let carry = 0;
    for (let j = 0; j < bytes.length; j++) {
      bytes[j] += carry;
      carry = bytes[j] >> 8;
      bytes[j] &= 0xff;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-internal-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }
    } else if (Buffer.isBuffer(body)) {
      try { body = JSON.parse(body.toString('utf-8')); } catch (e) { return res.status(400).json({ error: 'Malformed JSON payload' }); }
    }

    const { walletAddress, epochId = 'current_week', tokenMint: requestedMint } = body || {};

    if (!walletAddress) {
      return res.status(400).json({ error: 'Missing walletAddress' });
    }

    let userPublicKey;
    try {
      userPublicKey = new PublicKey(walletAddress.trim());
    } catch (e) {
      return res.status(400).json({ error: 'Invalid Solana wallet address' });
    }

    const PMEME_MINT_STR = '8UJhknp5VGatZD9SRop2b8eeBg1ZGJLMT1Gzmf2cpump';
    const rewardMint = new PublicKey(requestedMint || PMEME_MINT_STR);
    const tokenDecimals = 6;
    const defaultRewardAmount = 10000; // 10,000 PMEME tokens

    // 1. Resolve Relayer Keypair
    const relayerPrivKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerPrivKey) {
      // In mock/test environments without relayer key:
      return res.status(200).json({
        success: true,
        mock: true,
        message: 'Relayer key not configured. Mock claim successful.',
        rewardAmount: defaultRewardAmount,
        tokenMint: PMEME_MINT_STR,
      });
    }

    let relayerKp;
    try {
      if (relayerPrivKey.trim().startsWith('[')) {
        relayerKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(relayerPrivKey.trim())));
      } else {
        relayerKp = Keypair.fromSecretKey(base58Decode(relayerPrivKey.trim()));
      }
    } catch (err) {
      return res.status(500).json({ error: 'Invalid relayer key configuration' });
    }

    // 2. Setup RPC connection
    const rpcUrl = process.env.HELIUS_RPC_URL || process.env.VITE_RPC_URL || process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    // 3. Derive Associated Token Accounts
    const relayerATA = getAssociatedTokenAddressSync(rewardMint, relayerKp.publicKey);
    const userATA = getAssociatedTokenAddressSync(rewardMint, userPublicKey);

    // 4. Construct Transaction
    const transaction = new Transaction();

    // Priority Fee
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 })
    );

    // Instruction A: Idempotent ATA creation (User pays the rent if needed)
    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(
        userPublicKey,      // Payer of rent (Claimer)
        userATA,            // ATA to create
        userPublicKey,      // Owner of ATA
        rewardMint          // Token mint
      )
    );

    // Instruction B: SPL Token transfer from Relayer to User
    const units = BigInt(Math.round(defaultRewardAmount * (10 ** tokenDecimals)));
    transaction.add(
      createTransferCheckedInstruction(
        relayerATA,          // Source ATA (Relayer)
        rewardMint,          // Mint
        userATA,             // Destination ATA (User)
        relayerKp.publicKey, // Source Authority (Relayer)
        units,               // Amount
        tokenDecimals        // Decimals
      )
    );

    // Instruction C: On-chain Memo log
    const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    transaction.add(
      new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(`fiatwallet:reward-claim:${epochId}:${walletAddress}`, 'utf-8'),
      })
    );

    // 5. User is Fee Payer!
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPublicKey; // User pays gas fee

    // 6. Relayer Partially Signs as source authority
    transaction.partialSign(relayerKp);

    // 7. Serialize (requireAllSignatures: false) and return to client
    const serialized = transaction.serialize({ requireAllSignatures: false }).toString('base64');

    return res.status(200).json({
      transaction: serialized,
      rewardAmount: defaultRewardAmount,
      tokenSymbol: 'PMEME',
      tokenMint: PMEME_MINT_STR,
    });
  } catch (error) {
    console.error('[leaderboard_claim] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
