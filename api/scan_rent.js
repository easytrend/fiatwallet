/**
 * api/scan_rent.js — Vercel Serverless Function
 *
 * Scans a Solana wallet address for claimable empty token accounts (SOL rent reclaim)
 * and Pump.fun volume cashback (bonding curve and AMM) using authenticated Helius RPC.
 *
 * Safe on server side: utilizes HELIUS_RPC_URL / HELIUS_API_KEY from Vercel environment.
 */

import { Connection, PublicKey } from '@solana/web3.js';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMP_AMM_PROGRAM_ID = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

const STANDARD_SPL_RENT = 2_039_280;

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { wallet } = req.query;
  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid wallet parameter' });
  }

  let pubkey;
  try {
    pubkey = new PublicKey(wallet.trim());
  } catch (e) {
    return res.status(400).json({ error: 'Invalid Solana address: ' + e.message });
  }

  try {
    const rpcUrl = getBackendRpcUrl();
    const connection = new Connection(rpcUrl, 'confirmed');

    // 1. Scan Token and Token-2022 accounts in parallel
    const [resp1, resp2] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }).catch(err => {
        console.warn('[scan_rent] Token Program scan error:', err.message);
        return { value: [] };
      }),
      connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_2022_PROGRAM_ID }).catch(err => {
        console.warn('[scan_rent] Token-2022 scan error:', err.message);
        return { value: [] };
      }),
    ]);

    const emptyAccounts = [];
    const allAccounts = [
      ...((resp1 && resp1.value) || []).map(a => ({ ...a, programId: TOKEN_PROGRAM_ID.toBase58() })),
      ...((resp2 && resp2.value) || []).map(a => ({ ...a, programId: TOKEN_2022_PROGRAM_ID.toBase58() })),
    ];

    allAccounts.forEach(acc => {
      const parsed = acc.account?.data?.parsed?.info;
      if (!parsed || !parsed.tokenAmount) return;
      const amount = parsed.tokenAmount.amount;
      const uiAmount = parsed.tokenAmount.uiAmount || 0;

      if (amount === '0' || uiAmount === 0) {
        emptyAccounts.push({
          pubkey: acc.pubkey.toBase58 ? acc.pubkey.toBase58() : acc.pubkey.toString(),
          mint: parsed.mint,
          programId: acc.programId,
          lamports: Math.min(acc.account.lamports || STANDARD_SPL_RENT, STANDARD_SPL_RENT),
        });
      }
    });

    // 2. Check Pump.fun Bonding Curve Cashback
    let bondingCurveVal = 0;
    try {
      const [userVolumeAccumulator] = PublicKey.findProgramAddressSync(
        [Buffer.from('user_volume_accumulator'), pubkey.toBuffer()],
        PUMP_PROGRAM_ID
      );
      const pdaInfo = await connection.getAccountInfo(userVolumeAccumulator);
      if (pdaInfo) {
        const rentExemptMin = await connection.getMinimumBalanceForRentExemption(pdaInfo.data.length);
        const claimableLamports = Math.max(0, pdaInfo.lamports - rentExemptMin);
        bondingCurveVal = claimableLamports / 1e9;
      }
    } catch (e) {
      console.warn('[scan_rent] pump bonding curve cashback error:', e.message);
    }

    // 3. Check Pump.fun AMM Cashback
    let ammVal = 0;
    try {
      const [userAmmVolumeAccumulator] = PublicKey.findProgramAddressSync(
        [Buffer.from('user_volume_accumulator'), pubkey.toBuffer()],
        PUMP_AMM_PROGRAM_ID
      );
      const [ammWsolAta] = PublicKey.findProgramAddressSync(
        [
          userAmmVolumeAccumulator.toBuffer(),
          TOKEN_PROGRAM_ID.toBuffer(),
          WSOL_MINT.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const tokenBalanceResp = await connection.getTokenAccountBalance(ammWsolAta);
      if (tokenBalanceResp && tokenBalanceResp.value) {
        ammVal = tokenBalanceResp.value.uiAmount || 0;
      }
    } catch {
      // AMM WSOL ATA does not exist if user never traded on Pump AMM
    }

    const realCashback = bondingCurveVal + ammVal;

    return res.status(200).json({
      success: true,
      emptyAccounts,
      bondingCurveCashback: bondingCurveVal,
      ammCashback: ammVal,
      realCashback,
    });
  } catch (err) {
    console.error('[scan_rent] Unhandled scan error:', err);
    return res.status(500).json({
      error: 'Scan failed: ' + err.message,
      emptyAccounts: [],
      bondingCurveCashback: 0,
      ammCashback: 0,
      realCashback: 0,
    });
  }
}
