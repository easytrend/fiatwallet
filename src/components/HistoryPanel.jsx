import { useState, useEffect, useCallback, useMemo } from 'react';
import { getUnifiedWalletHistory } from '../services/historyService';

function formatTimestamp(ts) {
  if (!ts) return 'Unknown';
  const date = new Date(ts);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatFullDateTime(ts) {
  if (!ts) return 'N/A';
  return new Date(ts).toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function HistoryPanel({
  connection,
  effectivePublicKey,
  onBack,
  currency = 'USD',
  currRate = 1,
}) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'send' | 'receive' | 'swap' | 'p2p'
  const [selectedTx, setSelectedTx] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  const walletAddress = effectivePublicKey
    ? effectivePublicKey.toBase58()
    : (typeof localStorage !== 'undefined' ? localStorage.getItem('paj_manual_wallet') : '') || '';

  const loadHistory = useCallback(async (isRefresh = false) => {
    if (!walletAddress) {
      setHistory([]);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const items = await getUnifiedWalletHistory(connection, walletAddress, 30);
      setHistory(items);
    } catch (err) {
      console.warn('[HistoryPanel] Failed to load history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [connection, walletAddress]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const filteredHistory = useMemo(() => {
    if (filter === 'all') return history;
    if (filter === 'send') return history.filter(t => t.type === 'send' || t.type === 'bulk_send');
    if (filter === 'receive') return history.filter(t => t.type === 'receive');
    if (filter === 'swap') return history.filter(t => t.type === 'swap');
    if (filter === 'p2p') return history.filter(t => t.type === 'onramp' || t.type === 'offramp');
    return history;
  }, [history, filter]);

  const filterCounts = useMemo(() => ({
    all: history.length,
    send: history.filter(t => t.type === 'send' || t.type === 'bulk_send').length,
    receive: history.filter(t => t.type === 'receive').length,
    swap: history.filter(t => t.type === 'swap').length,
    p2p: history.filter(t => t.type === 'onramp' || t.type === 'offramp').length,
  }), [history]);

  return (
    <div style={{
      width: '100%',
      maxWidth: '480px',
      margin: '0 auto',
      color: 'var(--text, #f0f6ff)',
      fontFamily: 'var(--ff, sans-serif)',
      boxSizing: 'border-box',
    }}>
      {/* ── Top Bar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
            borderRadius: '10px',
            color: 'white',
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: '700',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontFamily: 'var(--ff)',
          }}
        >
          ← Wallet
        </button>

        <span style={{ fontSize: '15px', fontWeight: '800', color: 'white', letterSpacing: '-0.01em' }}>
          Activity &amp; History
        </span>

        <button
          onClick={() => loadHistory(true)}
          disabled={loading || refreshing}
          title="Refresh History"
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
            borderRadius: '10px',
            color: 'var(--text2, rgba(240, 246, 255, 0.7))',
            padding: '6px 10px',
            fontSize: '13px',
            fontWeight: '700',
            cursor: (loading || refreshing) ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span style={{
            display: 'inline-block',
            animation: refreshing ? 'spin 1s linear infinite' : 'none',
          }}>
            ↻
          </span>
        </button>
      </div>

      {/* ── Account Summary / Solscan Quick Link ── */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(17,30,56,0.6) 0%, rgba(10,22,40,0.8) 100%)',
        border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
        borderRadius: '16px',
        padding: '14px 16px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Connected Account
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: '700', color: 'white', marginTop: '2px' }}>
            {walletAddress ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}` : 'No wallet connected'}
          </div>
        </div>

        {walletAddress && (
          <a
            href={`https://solscan.io/account/${walletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '11px',
              fontWeight: '700',
              color: 'var(--cyan, #22d3ee)',
              textDecoration: 'none',
              background: 'rgba(34, 211, 238, 0.08)',
              border: '1px solid rgba(34, 211, 238, 0.25)',
              borderRadius: '8px',
              padding: '6px 10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            Solscan ↗
          </a>
        )}
      </div>

      {/* ── Filter Tabs ── */}
      <div style={{
        display: 'flex',
        gap: '6px',
        overflowX: 'auto',
        paddingBottom: '10px',
        marginBottom: '10px',
        scrollbarWidth: 'none',
      }}>
        {[
          { key: 'all', label: `All (${filterCounts.all})` },
          { key: 'send', label: `Sent (${filterCounts.send})` },
          { key: 'receive', label: `Received (${filterCounts.receive})` },
          { key: 'swap', label: `Swaps (${filterCounts.swap})` },
          { key: 'p2p', label: `P2P (${filterCounts.p2p})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              background: filter === tab.key ? 'rgba(163, 230, 53, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              border: filter === tab.key ? '1px solid rgba(163, 230, 53, 0.4)' : '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: '20px',
              color: filter === tab.key ? 'var(--lime, #a3e635)' : 'var(--text2, rgba(240, 246, 255, 0.6))',
              fontSize: '11.5px',
              fontWeight: '700',
              padding: '5px 12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Activity Items List ── */}
      {loading && history.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 0' }}>
          {[1, 2, 3, 4].map(n => (
            <div
              key={n}
              style={{
                height: '62px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '14px',
                animation: 'pulse 1.5s infinite',
              }}
            />
          ))}
        </div>
      ) : filteredHistory.length === 0 ? (
        <div style={{
          background: 'rgba(17, 30, 56, 0.35)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '16px',
          padding: '40px 20px',
          textAlign: 'center',
          marginTop: '10px',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto',
            fontSize: '20px',
            color: 'var(--text3)',
          }}>
            •
          </div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: 'white', marginBottom: '6px' }}>
            No Transactions Found
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text3)', maxWidth: '280px', margin: '0 auto', lineHeight: '1.5' }}>
            {filter === 'all'
              ? 'Transactions performed on this Solana address will appear here automatically.'
              : `No ${filter} transactions match your current filter.`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredHistory.map(tx => {
            const isSend = tx.type === 'send' || tx.type === 'bulk_send';
            const isReceive = tx.type === 'receive';
            const isSwap = tx.type === 'swap';
            const isP2P = tx.type === 'onramp' || tx.type === 'offramp';

            return (
              <div
                key={tx.id}
                onClick={() => setSelectedTx(tx)}
                style={{
                  background: 'rgba(17, 30, 56, 0.55)',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(26, 44, 82, 0.65)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(17, 30, 56, 0.55)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.07)';
                }}
              >
                {/* Left: Icon + Title + Timestamp */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: isReceive
                      ? 'rgba(163, 230, 53, 0.12)'
                      : isSend
                      ? 'rgba(248, 113, 113, 0.12)'
                      : isSwap
                      ? 'rgba(167, 139, 250, 0.12)'
                      : 'rgba(34, 211, 238, 0.12)',
                    border: `1px solid ${
                      isReceive
                        ? 'rgba(163, 230, 53, 0.25)'
                        : isSend
                        ? 'rgba(248, 113, 113, 0.25)'
                        : isSwap
                        ? 'rgba(167, 139, 250, 0.25)'
                        : 'rgba(34, 211, 238, 0.25)'
                    }`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    fontWeight: '800',
                    color: isReceive
                      ? 'var(--lime, #a3e635)'
                      : isSend
                      ? '#f87171'
                      : isSwap
                      ? '#a78bfa'
                      : 'var(--cyan, #22d3ee)',
                    flexShrink: 0,
                  }}>
                    {isReceive ? '↓' : isSend ? '↑' : isSwap ? '⇄' : '•'}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: '700',
                      color: 'white',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {tx.title}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: 'var(--text3)',
                      marginTop: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}>
                      <span>{formatTimestamp(tx.timestamp)}</span>
                      <span>•</span>
                      <span>{tx.status === 'confirmed' ? 'Confirmed' : tx.status === 'pending' ? 'Pending' : 'Failed'}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Amount + Badge */}
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                  {tx.amount ? (
                    <div style={{
                      fontSize: '13px',
                      fontWeight: '700',
                      fontFamily: 'var(--mono)',
                      color: isReceive ? 'var(--lime, #a3e635)' : 'white',
                    }}>
                      {tx.amount} {tx.symbol || ''}
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                      {tx.subtitle || 'Interaction'}
                    </div>
                  )}

                  <div style={{
                    fontSize: '10px',
                    fontWeight: '700',
                    marginTop: '2px',
                    color: tx.status === 'confirmed' ? 'var(--lime, #a3e635)' : (tx.status === 'pending' ? '#facc15' : '#f87171'),
                  }}>
                    {tx.status === 'confirmed' ? '✓' : (tx.status === 'pending' ? '•' : '✕')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Transaction Details Modal ── */}
      {selectedTx && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            background: 'rgba(5, 11, 20, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            boxSizing: 'border-box',
            animation: 'fadeIn 0.2s ease',
          }}
          onClick={() => setSelectedTx(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card, #111e38)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
              borderRadius: '20px',
              maxWidth: '420px',
              width: '100%',
              padding: '24px 20px',
              boxSizing: 'border-box',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
              animation: 'scaleUp 0.2s ease',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <span style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>
                Transaction Details
              </span>
              <button
                onClick={() => setSelectedTx(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text2)',
                  fontSize: '16px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Status & Amount Highlight */}
            <div style={{
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '16px',
              padding: '16px',
              textAlign: 'center',
              marginBottom: '18px',
            }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: '700',
                padding: '4px 10px',
                borderRadius: '20px',
                background: selectedTx.status === 'confirmed' ? 'rgba(163, 230, 53, 0.12)' : 'rgba(248, 113, 113, 0.12)',
                color: selectedTx.status === 'confirmed' ? 'var(--lime)' : '#f87171',
                marginBottom: '8px',
              }}>
                <span>{selectedTx.status === 'confirmed' ? '✓ Confirmed' : (selectedTx.status === 'pending' ? '• Pending' : '✕ Failed')}</span>
              </div>

              {selectedTx.amount && (
                <div style={{
                  fontSize: '24px',
                  fontWeight: '800',
                  color: 'white',
                  fontFamily: 'var(--mono)',
                  letterSpacing: '-0.02em',
                }}>
                  {selectedTx.amount} {selectedTx.symbol || ''}
                </div>
              )}

              <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
                {selectedTx.title}
              </div>
            </div>

            {/* Details Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {/* Timestamp */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text3)' }}>Date &amp; Time</span>
                <span style={{ color: 'white', fontWeight: '600' }}>{formatFullDateTime(selectedTx.timestamp)}</span>
              </div>

              {/* Network Fee */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text3)' }}>Network Fee</span>
                <span style={{ color: 'white', fontWeight: '600', fontFamily: 'var(--mono)' }}>{selectedTx.fee || '0.000005'} SOL</span>
              </div>

              {/* Slot */}
              {selectedTx.slot && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text3)' }}>Block Slot</span>
                  <span style={{ color: 'white', fontWeight: '600', fontFamily: 'var(--mono)' }}>#{selectedTx.slot}</span>
                </div>
              )}

              {/* Signature / TX Hash */}
              {selectedTx.signature && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text3)' }}>Transaction Signature</span>
                    <button
                      onClick={() => copyToClipboard(selectedTx.signature, 'sig')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: copiedKey === 'sig' ? 'var(--lime)' : 'var(--cyan)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: 0,
                        fontWeight: '700',
                      }}
                    >
                      {copiedKey === 'sig' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div style={{
                    fontSize: '11px',
                    fontFamily: 'var(--mono)',
                    color: 'var(--text2)',
                    wordBreak: 'break-all',
                    background: 'rgba(0,0,0,0.2)',
                    padding: '8px 10px',
                    borderRadius: '8px',
                  }}>
                    {selectedTx.signature}
                  </div>
                </div>
              )}

              {/* From Address */}
              {selectedTx.from && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text3)' }}>From</span>
                    <button
                      onClick={() => copyToClipboard(selectedTx.from, 'from')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: copiedKey === 'from' ? 'var(--lime)' : 'var(--cyan)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: 0,
                        fontWeight: '700',
                      }}
                    >
                      {copiedKey === 'from' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div style={{
                    fontSize: '11px',
                    fontFamily: 'var(--mono)',
                    color: 'var(--text2)',
                    wordBreak: 'break-all',
                    background: 'rgba(0,0,0,0.2)',
                    padding: '8px 10px',
                    borderRadius: '8px',
                  }}>
                    {selectedTx.from}
                  </div>
                </div>
              )}

              {/* To Address */}
              {selectedTx.to && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text3)' }}>To</span>
                    <button
                      onClick={() => copyToClipboard(selectedTx.to, 'to')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: copiedKey === 'to' ? 'var(--lime)' : 'var(--cyan)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: 0,
                        fontWeight: '700',
                      }}
                    >
                      {copiedKey === 'to' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <div style={{
                    fontSize: '11px',
                    fontFamily: 'var(--mono)',
                    color: 'var(--text2)',
                    wordBreak: 'break-all',
                    background: 'rgba(0,0,0,0.2)',
                    padding: '8px 10px',
                    borderRadius: '8px',
                  }}>
                    {selectedTx.to}
                  </div>
                </div>
              )}
            </div>

            {/* External Explorer Links */}
            {selectedTx.signature && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <a
                  href={`https://solscan.io/tx/${selectedTx.signature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    background: 'rgba(34, 211, 238, 0.1)',
                    border: '1px solid rgba(34, 211, 238, 0.3)',
                    borderRadius: '12px',
                    color: 'var(--cyan, #22d3ee)',
                    padding: '10px 14px',
                    fontSize: '12px',
                    fontWeight: '700',
                    textDecoration: 'none',
                  }}
                >
                  View on Solscan ↗
                </a>

                <a
                  href={`https://solana.fm/tx/${selectedTx.signature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '12px',
                    color: 'white',
                    padding: '10px 14px',
                    fontSize: '12px',
                    fontWeight: '700',
                    textDecoration: 'none',
                  }}
                >
                  View on SolanaFM ↗
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
