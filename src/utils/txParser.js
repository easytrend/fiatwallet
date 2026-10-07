import { KNOWN_MINTS } from '../data/tokens';

function resolveMint(mint) {
  if (!mint) return 'Token';
  if (KNOWN_MINTS[mint]) return KNOWN_MINTS[mint].symbol;
  if (mint === 'So11111111111111111111111111111111111111112') return 'SOL';
  if (mint.startsWith('EPjF')) return 'USDC';
  if (mint.startsWith('Es9v')) return 'USDT';
  return mint.slice(0, 4) + '...' + mint.slice(-4);
}

function readU64LE(bytes, offset = 0) {
  try {
    if (!bytes || bytes.length < offset + 8) return 0n;
    if (typeof bytes.readBigUInt64LE === 'function') {
      return bytes.readBigUInt64LE(offset);
    }
    let n = 0n;
    for (let i = 0; i < 8; i++) {
      n += BigInt(bytes[offset + i]) << BigInt(i * 8);
    }
    return n;
  } catch {
    return 0n;
  }
}

/**
 * Extracts action type, amounts, tokens, and recipients from a Solana Transaction.
 */
export function parseTransactionBreakdown(tx, userAddress) {
  if (!tx) return { actionType: 'Transaction', details: [] };

  const userKeyStr = String(userAddress || '');
  let actionType = 'Transaction';
  let amount = null;
  let symbol = 'SOL';
  let recipient = null;
  let route = null;
  const details = [];

  // Legacy Transaction
  if (Array.isArray(tx.instructions)) {
    const ixs = tx.instructions;

    // Check if DEX swap
    const isDex = ixs.some(ix => {
      const pid = ix.programId?.toBase58?.() || String(ix.programId || '');
      return pid.startsWith('JUP') || pid.includes('whirL') || pid === '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
    });

    if (isDex) {
      actionType = 'Swap';
      route = 'Jupiter DEX Aggregator';
    } else {
      // Check for System Program transfer (native SOL)
      const sysTransfer = ixs.find(ix => {
        const pid = ix.programId?.toBase58?.() || String(ix.programId || '');
        return pid === '11111111111111111111111111111111' && ix.data && ix.data.length >= 12 && ix.data[0] === 2;
      });

      if (sysTransfer && sysTransfer.keys?.length >= 2) {
        actionType = 'Send';
        recipient = sysTransfer.keys[1]?.pubkey?.toBase58?.() || '';
        symbol = 'SOL';
        try {
          const lamports = readU64LE(sysTransfer.data, 4);
          if (lamports > 0n) {
            amount = (Number(lamports) / 1e9).toFixed(4);
          }
        } catch {}
      }

      // Check for SPL Token transfer
      const splTransfer = ixs.find(ix => {
        const pid = ix.programId?.toBase58?.() || String(ix.programId || '');
        return (pid === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' || pid === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') &&
          ix.data && (ix.data[0] === 3 || ix.data[0] === 12);
      });

      if (splTransfer) {
        actionType = 'Send';
        recipient = splTransfer.keys?.[1]?.pubkey?.toBase58?.() || recipient;
        try {
          const raw = readU64LE(splTransfer.data, 1);
          if (raw > 0n) {
            amount = (Number(raw) / 1e6).toFixed(2);
          }
        } catch {}
      }
    }
  } else if (tx.message) {
    // Versioned Transaction
    const accountKeys = tx.message.staticAccountKeys || [];
    const isDex = accountKeys.some(k => {
      const s = k.toBase58?.() || String(k);
      return s.startsWith('JUP') || s.includes('whirL') || s === '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
    });
    if (isDex) {
      actionType = 'Swap';
      route = 'Jupiter DEX Aggregator';
    }
  }

  return {
    actionType,
    amount,
    symbol,
    recipient,
    route,
    details,
  };
}
