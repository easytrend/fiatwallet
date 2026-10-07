import { PublicKey } from '@solana/web3.js';
import { supabase } from './supabase';
import { KNOWN_MINTS } from '../data/tokens';

const JUPITER_PROGRAM_IDS = [
  'JUP6LkbZbjS1jKKwapdHNy74bhtu8GL3A27Wr6ndVKS',
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
  'JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21PdT827AFmT23',
  'JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uEJUr',
];

const DEX_PROGRAM_IDS = [
  ...JUPITER_PROGRAM_IDS,
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM V4
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Orca Whirlpool
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
];

/**
 * Resolves a token mint address to a known symbol.
 */
function resolveMintSymbol(mint) {
  if (!mint) return 'Token';
  if (KNOWN_MINTS[mint]) return KNOWN_MINTS[mint].symbol;
  if (mint === 'So11111111111111111111111111111111111111112') return 'SOL';
  if (mint.startsWith('EPjF')) return 'USDC';
  if (mint.startsWith('Es9v')) return 'USDT';
  return mint.slice(0, 4) + '...' + mint.slice(-4);
}

/**
 * Parses a single Solana transaction into a human-friendly activity item.
 */
export function parseSolanaTransaction(sigInfo, parsedTx, userAddress) {
  const signature = sigInfo.signature;
  const slot = sigInfo.slot;
  const isFailed = Boolean(sigInfo.err);
  const status = isFailed ? 'failed' : 'confirmed';
  const timestamp = sigInfo.blockTime ? sigInfo.blockTime * 1000 : Date.now();
  const fee = parsedTx?.meta?.fee ? (parsedTx.meta.fee / 1e9).toFixed(6) : '0.000005';

  if (!parsedTx || !parsedTx.meta || !parsedTx.transaction) {
    return {
      id: signature,
      signature,
      slot,
      status,
      timestamp,
      type: 'interaction',
      title: 'Solana Transaction',
      subtitle: `Slot #${slot}`,
      amount: null,
      symbol: 'SOL',
      fee,
      from: null,
      to: null,
      memo: sigInfo.memo || null,
      source: 'onchain',
    };
  }

  const { meta, transaction } = parsedTx;
  const message = transaction.message;
  const instructions = message?.instructions || [];
  const accountKeys = message?.accountKeys || [];
  const userKeyStr = String(userAddress);

  // 1. Check if transaction involved a known DEX aggregator or AMM (Swap)
  const isSwap = instructions.some(ix => {
    const progId = typeof ix.programId === 'string' ? ix.programId : ix.programId?.toBase58?.();
    return DEX_PROGRAM_IDS.includes(progId);
  });

  if (isSwap) {
    let inSymbol = 'SOL';
    let outSymbol = 'Tokens';
    let displayAmt = '';

    // Inspect user's token balance deltas
    if (meta.preTokenBalances && meta.postTokenBalances) {
      const userPre = meta.preTokenBalances.filter(b => b.owner === userKeyStr);
      const userPost = meta.postTokenBalances.filter(b => b.owner === userKeyStr);

      for (const pre of userPre) {
        const post = userPost.find(p => p.mint === pre.mint);
        const preAmt = pre.uiTokenAmount?.uiAmount || 0;
        const postAmt = post?.uiTokenAmount?.uiAmount || 0;
        if (preAmt > postAmt) {
          inSymbol = resolveMintSymbol(pre.mint);
        } else if (postAmt > preAmt) {
          outSymbol = resolveMintSymbol(pre.mint);
          displayAmt = (postAmt - preAmt).toFixed(4);
        }
      }
    }

    return {
      id: signature,
      signature,
      slot,
      status,
      timestamp,
      type: 'swap',
      title: `Swap ${inSymbol} → ${outSymbol}`,
      subtitle: 'Jupiter / DEX Aggregator',
      amount: displayAmt,
      symbol: outSymbol,
      fee,
      from: userKeyStr,
      to: 'DEX Liquidity Pool',
      memo: sigInfo.memo || null,
      source: 'onchain',
    };
  }

  // 2. Check for SPL Token Transfer in parsed instructions
  for (const ix of instructions) {
    if (ix.program === 'spl-token' || ix.program === 'spl-token-2022') {
      const parsed = ix.parsed;
      if (parsed && (parsed.type === 'transfer' || parsed.type === 'transferChecked')) {
        const info = parsed.info;
        const amount = info.tokenAmount?.uiAmountString || info.tokenAmount?.uiAmount || info.amount || '0';
        const mint = info.mint || '';
        const symbol = resolveMintSymbol(mint);
        const destination = info.destination || '';
        const authority = info.authority || info.source || '';

        // Compare against user's token accounts
        const userPre = (meta.preTokenBalances || []).filter(b => b.owner === userKeyStr);
        const userPost = (meta.postTokenBalances || []).filter(b => b.owner === userKeyStr);
        let isUserSending = authority === userKeyStr;

        if (userPre.length > 0 && userPost.length > 0) {
          const preSum = userPre.reduce((acc, b) => acc + (b.uiTokenAmount?.uiAmount || 0), 0);
          const postSum = userPost.reduce((acc, b) => acc + (b.uiTokenAmount?.uiAmount || 0), 0);
          if (postSum < preSum) isUserSending = true;
          else if (postSum > preSum) isUserSending = false;
        }

        if (isUserSending) {
          return {
            id: signature,
            signature,
            slot,
            status,
            timestamp,
            type: 'send',
            title: `Sent ${symbol}`,
            subtitle: destination ? `To ${destination.slice(0, 4)}...${destination.slice(-4)}` : 'Token Transfer',
            amount: `-${amount}`,
            symbol,
            fee,
            from: userKeyStr,
            to: destination,
            memo: sigInfo.memo || null,
            source: 'onchain',
          };
        } else {
          return {
            id: signature,
            signature,
            slot,
            status,
            timestamp,
            type: 'receive',
            title: `Received ${symbol}`,
            subtitle: authority ? `From ${authority.slice(0, 4)}...${authority.slice(-4)}` : 'Token Transfer',
            amount: `+${amount}`,
            symbol,
            fee,
            from: authority,
            to: userKeyStr,
            memo: sigInfo.memo || null,
            source: 'onchain',
          };
        }
      }
    }
  }

  // 3. Check for Native SOL Transfer (system program)
  for (const ix of instructions) {
    if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
      const info = ix.parsed.info;
      const lamports = Number(info.lamports) || 0;
      const solAmt = (lamports / 1e9).toFixed(4);
      const isSender = info.source === userKeyStr;

      if (isSender) {
        return {
          id: signature,
          signature,
          slot,
          status,
          timestamp,
          type: 'send',
          title: 'Sent SOL',
          subtitle: `To ${info.destination?.slice(0, 4)}...${info.destination?.slice(-4)}`,
          amount: `-${solAmt}`,
          symbol: 'SOL',
          fee,
          from: info.source,
          to: info.destination,
          memo: sigInfo.memo || null,
          source: 'onchain',
        };
      } else if (info.destination === userKeyStr) {
        return {
          id: signature,
          signature,
          slot,
          status,
          timestamp,
          type: 'receive',
          title: 'Received SOL',
          subtitle: `From ${info.source?.slice(0, 4)}...${info.source?.slice(-4)}`,
          amount: `+${solAmt}`,
          symbol: 'SOL',
          fee,
          from: info.source,
          to: info.destination,
          memo: sigInfo.memo || null,
          source: 'onchain',
        };
      }
    }
  }

  // 4. Fallback: inspect raw SOL balance changes for user
  const userAccountIndex = accountKeys.findIndex(k => {
    const keyStr = typeof k === 'string' ? k : k.pubkey ? (typeof k.pubkey === 'string' ? k.pubkey : k.pubkey.toBase58?.()) : '';
    return keyStr === userKeyStr;
  });

  if (userAccountIndex !== -1 && meta.preBalances && meta.postBalances) {
    const preLamports = meta.preBalances[userAccountIndex] || 0;
    const postLamports = meta.postBalances[userAccountIndex] || 0;
    const delta = (postLamports - preLamports) / 1e9;
    const feeSOL = Number(fee) || 0;

    // Notice: if user is fee payer and delta is just -fee, it's a program interaction
    if (Math.abs(delta + feeSOL) < 0.00001 && delta < 0) {
      return {
        id: signature,
        signature,
        slot,
        status,
        timestamp,
        type: 'interaction',
        title: 'Program Interaction',
        subtitle: `Fee: ${fee} SOL`,
        amount: null,
        symbol: 'SOL',
        fee,
        from: userKeyStr,
        to: null,
        memo: sigInfo.memo || null,
        source: 'onchain',
      };
    } else if (delta < 0) {
      const netSent = Math.abs(delta + feeSOL).toFixed(4);
      return {
        id: signature,
        signature,
        slot,
        status,
        timestamp,
        type: 'send',
        title: 'Sent SOL',
        subtitle: `Slot #${slot}`,
        amount: `-${netSent}`,
        symbol: 'SOL',
        fee,
        from: userKeyStr,
        to: null,
        memo: sigInfo.memo || null,
        source: 'onchain',
      };
    } else if (delta > 0) {
      return {
        id: signature,
        signature,
        slot,
        status,
        timestamp,
        type: 'receive',
        title: 'Received SOL',
        subtitle: `Slot #${slot}`,
        amount: `+${delta.toFixed(4)}`,
        symbol: 'SOL',
        fee,
        from: null,
        to: userKeyStr,
        memo: sigInfo.memo || null,
        source: 'onchain',
      };
    }
  }

  // Generic fallback
  return {
    id: signature,
    signature,
    slot,
    status,
    timestamp,
    type: 'interaction',
    title: 'Smart Contract Interaction',
    subtitle: `Fee: ${fee} SOL`,
    amount: null,
    symbol: 'SOL',
    fee,
    from: userKeyStr,
    to: null,
    memo: sigInfo.memo || null,
    source: 'onchain',
  };
}

/**
 * Fetch and merge transaction history from both on-chain Solana RPC and Supabase.
 */
export async function getUnifiedWalletHistory(connection, walletAddress, limit = 25) {
  if (!walletAddress) return [];

  const addressStr = String(walletAddress).trim();
  let pubkey;
  try {
    pubkey = new PublicKey(addressStr);
  } catch {
    return [];
  }

  // Parallel tasks: Fetch on-chain signatures + Fetch Supabase ledger
  const onchainPromise = (async () => {
    if (!connection || typeof connection.getSignaturesForAddress !== 'function') return [];
    try {
      const sigInfos = await connection.getSignaturesForAddress(pubkey, { limit });
      if (!sigInfos || sigInfos.length === 0) return [];

      // Fetch parsed transactions for first batch
      const batchSigs = sigInfos.slice(0, 15).map(s => s.signature);
      let parsedTxs = [];
      try {
        parsedTxs = await connection.getParsedTransactions(batchSigs, {
          maxSupportedTransactionVersion: 0,
        });
      } catch (e) {
        console.warn('[HistoryService] getParsedTransactions batch failed:', e?.message);
      }

      return sigInfos.map((sigInfo, idx) => {
        const parsed = parsedTxs && parsedTxs[idx] ? parsedTxs[idx] : null;
        return parseSolanaTransaction(sigInfo, parsed, addressStr);
      });
    } catch (err) {
      console.warn('[HistoryService] On-chain history fetch error:', err?.message);
      return [];
    }
  })();

  const supabasePromise = (async () => {
    if (!supabase) return [];
    try {
      const [txRes, p2pRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('user_address', addressStr)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('p2p_transactions')
          .select('*')
          .eq('user_address', addressStr)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      const items = [];

      if (txRes.data) {
        for (const t of txRes.data) {
          const type = t.transaction_type || 'send';
          items.push({
            id: t.signature || `sb_${t.id}`,
            signature: t.signature,
            slot: null,
            status: 'confirmed',
            timestamp: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
            type: type === 'swap' ? 'swap' : (type === 'bulk_send' ? 'bulk_send' : 'send'),
            title: type === 'swap' ? 'DEX Swap' : (type === 'bulk_send' ? 'Bulk Send' : `Sent ${t.token_symbol || 'SOL'}`),
            subtitle: type === 'swap' ? 'Jupiter Swap' : 'FiatWallet Send',
            amount: t.token_amount ? `-${t.token_amount}` : null,
            symbol: t.token_symbol || 'SOL',
            usdValue: t.usd_value || null,
            fee: '0.000005',
            from: addressStr,
            to: null,
            source: 'supabase',
          });
        }
      }

      if (p2pRes.data) {
        for (const p of p2pRes.data) {
          const isBuy = p.transaction_type === 'p2p_onramp';
          const sym = p.token_symbol || 'USDC';
          const fiatCurr = p.fiat_currency || 'NGN';
          const fiatAmt = p.fiat_amount ? Number(p.fiat_amount).toLocaleString() : '0';
          const isPending = ['INIT', 'PENDING', 'PROCESSING'].includes(p.status);
          const isFailed = p.status === 'ERROR';

          items.push({
            id: p.signature || `p2p_${p.order_id}`,
            signature: p.signature?.startsWith('pending_') ? null : p.signature,
            orderId: p.order_id,
            slot: null,
            status: isFailed ? 'failed' : (isPending ? 'pending' : 'confirmed'),
            timestamp: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
            type: isBuy ? 'onramp' : 'offramp',
            title: isBuy ? `P2P Buy ${sym}` : `P2P Cashout ${sym}`,
            subtitle: `${fiatCurr} ${fiatAmt} • ${p.bank_name || 'Bank Transfer'}`,
            amount: isBuy ? `+${p.crypto_amount}` : `-${p.crypto_amount}`,
            symbol: sym,
            fiatAmount: fiatAmt,
            fiatCurrency: fiatCurr,
            fee: '0.000000',
            from: isBuy ? 'PajCash Gateway' : addressStr,
            to: isBuy ? addressStr : (p.bank_name ? `${p.bank_name} (${p.account_number})` : 'Bank Account'),
            source: 'p2p',
          });
        }
      }

      return items;
    } catch (err) {
      console.warn('[HistoryService] Supabase history fetch error:', err?.message);
      return [];
    }
  })();

  const [onchainItems, supabaseItems] = await Promise.all([onchainPromise, supabasePromise]);

  // Merge and deduplicate by signature (prefer on-chain data for signatures, enriched with Supabase metadata)
  const map = new Map();

  for (const item of onchainItems) {
    if (item.signature) {
      map.set(item.signature, item);
    } else {
      map.set(item.id, item);
    }
  }

  for (const item of supabaseItems) {
    if (item.signature && map.has(item.signature)) {
      // Enrich existing on-chain item with friendly title/usdValue
      const existing = map.get(item.signature);
      existing.usdValue = item.usdValue || existing.usdValue;
      if (item.type === 'onramp' || item.type === 'offramp') {
        existing.type = item.type;
        existing.title = item.title;
        existing.subtitle = item.subtitle;
      }
    } else {
      map.set(item.id, item);
    }
  }

  const combined = Array.from(map.values());
  // Sort descending by timestamp
  combined.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  return combined;
}
