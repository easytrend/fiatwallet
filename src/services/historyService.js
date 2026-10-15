import { PublicKey } from '@solana/web3.js';
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
 * Parses a Helius Enhanced Transaction into a standard wallet activity item.
 */
export function parseHeliusTransaction(tx, userAddress) {
  const userKeyStr = String(userAddress);
  const signature = tx.signature;
  const isFailed = Boolean(tx.transactionError);
  const status = isFailed ? 'failed' : 'confirmed';
  const timestamp = tx.timestamp ? tx.timestamp * 1000 : Date.now();
  const fee = tx.fee !== undefined ? (tx.fee / 1e9).toFixed(6) : '0.000005';
  const slot = tx.slot || null;
  const txType = (tx.type || 'UNKNOWN').toUpperCase();

  // 1. SWAP (Jupiter, Raydium, Orca, Pump.fun, etc.)
  if (txType === 'SWAP') {
    let inSymbol = 'SOL';
    let outSymbol = 'SOL';
    let inAmount = '';
    let outAmount = '';

    if (Array.isArray(tx.tokenTransfers)) {
      for (const t of tx.tokenTransfers) {
        const symbol = t.tokenStandard === 'NonFungible' ? 'NFT' : (t.tokenName || t.symbol || resolveMintSymbol(t.mint));
        if (t.fromUserAccount === userKeyStr) {
          inSymbol = symbol;
          inAmount = t.tokenAmount !== undefined ? String(t.tokenAmount) : '';
        } else if (t.toUserAccount === userKeyStr) {
          outSymbol = symbol;
          outAmount = t.tokenAmount !== undefined ? String(t.tokenAmount) : '';
        }
      }
    }

    if (Array.isArray(tx.nativeTransfers)) {
      for (const n of tx.nativeTransfers) {
        const solAmt = (n.amount / 1e9).toFixed(4);
        if (n.fromUserAccount === userKeyStr && !inAmount) {
          inSymbol = 'SOL';
          inAmount = solAmt;
        } else if (n.toUserAccount === userKeyStr && !outAmount) {
          outSymbol = 'SOL';
          outAmount = solAmt;
        }
      }
    }

    const sourceName = tx.source ? tx.source.replace(/_/g, ' ') : 'DEX';

    return {
      id: signature,
      signature,
      slot,
      status,
      timestamp,
      type: 'swap',
      title: `Swap ${inSymbol} → ${outSymbol}`,
      subtitle: `${sourceName} Swap`,
      amount: outAmount ? `+${outAmount}` : (inAmount ? `-${inAmount}` : null),
      symbol: outSymbol,
      fee,
      from: userKeyStr,
      to: sourceName,
      source: 'onchain',
      rawType: txType,
    };
  }

  // 2. SPL TOKEN TRANSFERS
  if (Array.isArray(tx.tokenTransfers) && tx.tokenTransfers.length > 0) {
    const userTransfer = tx.tokenTransfers.find(
      t => t.fromUserAccount === userKeyStr || t.toUserAccount === userKeyStr
    ) || tx.tokenTransfers[0];

    const isUserSending = userTransfer.fromUserAccount === userKeyStr;
    const isUserReceiving = userTransfer.toUserAccount === userKeyStr;
    const symbol = userTransfer.tokenStandard === 'NonFungible'
      ? 'NFT'
      : (userTransfer.symbol || resolveMintSymbol(userTransfer.mint));
    const rawAmt = userTransfer.tokenAmount !== undefined ? Number(userTransfer.tokenAmount) : 0;
    const amountStr = rawAmt > 0 && rawAmt < 0.0001 ? rawAmt.toExponential(2) : String(rawAmt);
    const counterParty = isUserSending ? userTransfer.toUserAccount : userTransfer.fromUserAccount;
    const counterPartyShort = counterParty ? `${counterParty.slice(0, 4)}...${counterParty.slice(-4)}` : '';

    if (isUserReceiving) {
      return {
        id: signature,
        signature,
        slot,
        status,
        timestamp,
        type: 'receive',
        title: `Received ${symbol}`,
        subtitle: counterPartyShort ? `From ${counterPartyShort}` : (tx.description || 'Token Transfer'),
        amount: `+${amountStr}`,
        symbol,
        fee,
        from: counterParty,
        to: userKeyStr,
        source: 'onchain',
        rawType: txType,
      };
    } else if (isUserSending) {
      return {
        id: signature,
        signature,
        slot,
        status,
        timestamp,
        type: 'send',
        title: `Sent ${symbol}`,
        subtitle: counterPartyShort ? `To ${counterPartyShort}` : (tx.description || 'Token Transfer'),
        amount: `-${amountStr}`,
        symbol,
        fee,
        from: userKeyStr,
        to: counterParty,
        source: 'onchain',
        rawType: txType,
      };
    }
  }

  // 3. NATIVE SOL TRANSFERS
  if (Array.isArray(tx.nativeTransfers) && tx.nativeTransfers.length > 0) {
    const userNative = tx.nativeTransfers.find(
      n => n.fromUserAccount === userKeyStr || n.toUserAccount === userKeyStr
    );

    if (userNative) {
      const solAmt = (userNative.amount / 1e9).toFixed(4);
      const isSending = userNative.fromUserAccount === userKeyStr;
      const counterParty = isSending ? userNative.toUserAccount : userNative.fromUserAccount;
      const counterPartyShort = counterParty ? `${counterParty.slice(0, 4)}...${counterParty.slice(-4)}` : '';

      return {
        id: signature,
        signature,
        slot,
        status,
        timestamp,
        type: isSending ? 'send' : 'receive',
        title: isSending ? 'Sent SOL' : 'Received SOL',
        subtitle: counterPartyShort ? (isSending ? `To ${counterPartyShort}` : `From ${counterPartyShort}`) : (tx.description || 'SOL Transfer'),
        amount: isSending ? `-${solAmt}` : `+${solAmt}`,
        symbol: 'SOL',
        fee,
        from: isSending ? userKeyStr : counterParty,
        to: isSending ? counterParty : userKeyStr,
        source: 'onchain',
        rawType: txType,
      };
    }
  }

  // 4. NFT MINT / SALE / BURN / COMPRESSED NFT
  if (txType.includes('NFT') || txType === 'BURN' || txType === 'TOKEN_MINT') {
    const readable = txType.replace(/_/g, ' ');
    return {
      id: signature,
      signature,
      slot,
      status,
      timestamp,
      type: 'nft',
      title: tx.description || readable,
      subtitle: `${tx.source ? tx.source.replace(/_/g, ' ') + ' • ' : ''}Fee: ${fee} SOL`,
      amount: null,
      symbol: 'SOL',
      fee,
      from: userKeyStr,
      to: tx.source || null,
      source: 'onchain',
      rawType: txType,
    };
  }

  // 5. GENERIC PROGRAM / SMART CONTRACT INTERACTION
  const readable = txType !== 'UNKNOWN' ? txType.replace(/_/g, ' ') : 'Smart Contract Interaction';
  return {
    id: signature,
    signature,
    slot,
    status,
    timestamp,
    type: 'interaction',
    title: tx.description || readable,
    subtitle: `${tx.source ? tx.source.replace(/_/g, ' ') + ' • ' : ''}Fee: ${fee} SOL`,
    amount: null,
    symbol: 'SOL',
    fee,
    from: userKeyStr,
    to: tx.source || null,
    source: 'onchain',
    rawType: txType,
  };
}

/**
 * Parses a single Solana transaction from raw RPC into a human-friendly activity item.
 * Used as high-reliability fallback when Helius indexer API is unreachable.
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
      amount: displayAmt ? `+${displayAmt}` : null,
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

  // 3. Native SOL Balance Delta
  if (meta.preBalances && meta.postBalances && message.accountKeys) {
    const keys = message.accountKeys.map(k => (typeof k === 'string' ? k : k.pubkey?.toBase58?.() || String(k)));
    const userIdx = keys.indexOf(userKeyStr);

    if (userIdx !== -1) {
      const preLamports = meta.preBalances[userIdx] || 0;
      const postLamports = meta.postBalances[userIdx] || 0;
      const deltaLamports = postLamports - preLamports;
      const delta = deltaLamports / 1e9;
      const feeSOL = Number(fee);

      if (Math.abs(delta) < 0.000001 || Math.abs(delta + feeSOL) < 0.000001) {
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
  }

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
 * Fallback to direct on-chain RPC parsing if Helius indexer API is unreachable.
 */
async function fetchOnChainRpcFallback(connection, pubkey, addressStr, limit) {
  if (!connection || typeof connection.getSignaturesForAddress !== 'function') return [];
  try {
    const sigInfos = await connection.getSignaturesForAddress(pubkey, { limit });
    if (!sigInfos || sigInfos.length === 0) return [];

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
    console.warn('[HistoryService] RPC fallback failed:', err?.message);
    return [];
  }
}

/**
 * Fetch wallet transaction history via pure Blockchain Indexing (Helius) or RPC nodes.
 * Identical to self-custodial wallets like Phantom or Solflare.
 * Zero database / Supabase dependencies.
 */
export async function getUnifiedWalletHistory(connection, walletAddress, limit = 30) {
  if (!walletAddress) return [];

  const addressStr = String(walletAddress).trim();
  let pubkey;
  try {
    pubkey = new PublicKey(addressStr);
  } catch {
    return [];
  }

  // 1. Query Helius Blockchain Indexer via serverless proxy
  const endpoints = [
    `/api/history?address=${encodeURIComponent(addressStr)}&limit=${limit}`,
    `https://fiatwallet.app/api/history?address=${encodeURIComponent(addressStr)}&limit=${limit}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.transactions)) {
          const items = json.transactions.map(tx => parseHeliusTransaction(tx, addressStr));
          items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          return items;
        }
      }
    } catch {
      // Continue to next endpoint or fallback
    }
  }

  // 2. Pure On-Chain RPC Fallback
  const fallbackItems = await fetchOnChainRpcFallback(connection, pubkey, addressStr, limit);
  fallbackItems.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return fallbackItems;
}
