import { useState, useEffect, useRef, useCallback } from 'react';
import {
  pairWithUri,
  approveSessionProposal,
  rejectSessionProposal,
  respondToRequest,
  rejectRequest,
  getActiveSessions,
  disconnectSession,
  handleSessionRequest,
  getWalletKit,
} from '../services/walletConnectService';

/**
 * WalletConnectModal
 *
 * Full WalletConnect v2 wallet-side UI for FiatWallet.
 * This is what allows FiatWallet to connect to any dApp that supports WalletConnect
 * (Raydium, Meteora, Jupiter, Magic Eden, Orca, Kamino — all of them do).
 *
 * Usage:
 *   1. Open a dApp in FiatWallet Explorer
 *   2. Tap "Connect Wallet" inside the dApp
 *   3. Choose "WalletConnect" from the dApp's wallet selection
 *   4. Copy the wc:... URI shown by the dApp
 *   5. Tap the blue "WC" button in FiatWallet's top bar
 *   6. Paste the URI and tap Connect
 *   7. Approve the connection → done, wallet is connected!
 */
export default function WalletConnectModal({
  open,
  onClose,
  publicKey,
  signTransaction,
  connection,
}) {
  const [screen, setScreen] = useState('pair'); // 'pair' | 'proposal' | 'request' | 'sessions'
  const [wcUri, setWcUri] = useState('');
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [pendingProposal, setPendingProposal] = useState(null);
  const [approving, setApproving] = useState(false);

  const [pendingRequest, setPendingRequest] = useState(null);
  const [signing, setSigning] = useState(false);

  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const inputRef = useRef(null);
  const addr = publicKey ? publicKey.toBase58() : null;

  // Load active sessions
  const refreshSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const list = await getActiveSessions();
      setSessions(list);
    } catch {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  // Set up WC event listeners when modal opens
  useEffect(() => {
    if (!open) return;

    // Pre-warm WalletKit SDK in background
    getWalletKit().catch(() => {});
    refreshSessions();

    const onProposal = (e) => {
      setPendingProposal(e.detail);
      setScreen('proposal');
      setError(null);
      setSuccessMsg(null);
    };

    const onRequest = (e) => {
      setPendingRequest(e.detail);
      setScreen('request');
    };

    const onDelete = () => {
      refreshSessions();
      setSuccessMsg('Session ended by dApp.');
    };

    window.addEventListener('fiatwallet:wc-session-proposal', onProposal);
    window.addEventListener('fiatwallet:wc-session-request', onRequest);
    window.addEventListener('fiatwallet:wc-session-delete', onDelete);

    return () => {
      window.removeEventListener('fiatwallet:wc-session-proposal', onProposal);
      window.removeEventListener('fiatwallet:wc-session-request', onRequest);
      window.removeEventListener('fiatwallet:wc-session-delete', onDelete);
    };
  }, [open, refreshSessions]);

  // Auto-focus input on open
  useEffect(() => {
    if (open && screen === 'pair') {
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [open, screen]);

  // Reset to pair screen when closed
  useEffect(() => {
    if (!open) {
      setScreen('pair');
      setWcUri('');
      setError(null);
      setSuccessMsg(null);
      setPendingProposal(null);
      setPendingRequest(null);
    }
  }, [open]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      setWcUri(trimmed);
      setError(null);
      // Auto-connect if it looks like a valid WC URI
      if (trimmed.startsWith('wc:')) {
        doPair(trimmed);
      }
    } catch {
      setError('Clipboard read failed. Please paste manually.');
    }
  };

  const doPair = async (uri) => {
    const cleanUri = (uri || wcUri).trim();
    if (!cleanUri.startsWith('wc:')) {
      setError('Invalid URI. It must start with wc: — copy it from the dApp\'s WalletConnect screen.');
      return;
    }

    setPairing(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await pairWithUri(cleanUri);
      setWcUri('');
      setSuccessMsg('Paired successfully. Waiting for dApp to send a session request...');
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('already exists') || msg.includes('Pairing already exists')) {
        setError('This QR code has already been used. Go back to the dApp and click "Connect Wallet" again to get a fresh WC URI.');
      } else {
        setError('Pairing failed: ' + (msg || 'Unknown error. The URI may be expired — get a fresh one from the dApp.'));
      }
    } finally {
      setPairing(false);
    }
  };

  const handleApprove = async () => {
    if (!pendingProposal || !addr) return;
    setApproving(true);
    setError(null);
    try {
      await approveSessionProposal(pendingProposal, addr);
      setPendingProposal(null);
      setSuccessMsg('Connected to dApp via WalletConnect.');
      await refreshSessions();
      setScreen('sessions');
    } catch (err) {
      setError('Approval failed: ' + (err?.message || 'Unknown error.'));
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!pendingProposal) return;
    try { await rejectSessionProposal(pendingProposal); } catch { /* ignore */ }
    setPendingProposal(null);
    setScreen('pair');
  };

  const handleSignApprove = async () => {
    if (!pendingRequest || !signTransaction) return;
    setSigning(true);
    setError(null);
    try {
      const result = await handleSessionRequest(pendingRequest, signTransaction, connection);
      await respondToRequest(pendingRequest, result);
      setPendingRequest(null);
      setSuccessMsg('Transaction signed and sent to dApp.');
      setScreen('sessions');
    } catch (err) {
      try { await rejectRequest(pendingRequest, err?.message); } catch { /* ignore */ }
      setPendingRequest(null);
      setError('Signing failed: ' + (err?.message || 'Unknown error.'));
      setScreen('sessions');
    } finally {
      setSigning(false);
    }
  };

  const handleSignReject = async () => {
    if (!pendingRequest) return;
    try { await rejectRequest(pendingRequest); } catch { /* ignore */ }
    setPendingRequest(null);
    setScreen('sessions');
  };

  const handleDisconnect = async (topic) => {
    try {
      await disconnectSession(topic);
      setSessions((prev) => prev.filter((s) => s.topic !== topic));
    } catch { /* ignore */ }
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999999,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 540,
          background: '#0d1f3c',
          borderRadius: '22px 22px 0 0',
          border: '1px solid rgba(255,255,255,0.09)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          position: 'sticky', top: 0,
          background: '#0d1f3c', zIndex: 2,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <WCLogo size={24} />
            <span style={{ fontSize: 17, fontWeight: 800, color: 'white' }}>WalletConnect</span>
            {sessions.length > 0 && (
              <span style={{
                background: '#a3e635', color: '#090d16',
                borderRadius: 20, fontSize: 11, fontWeight: 800,
                padding: '2px 7px',
              }}>{sessions.length} active</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {sessions.length > 0 && (
              <NavBtn active={screen === 'sessions'} onClick={() => setScreen('sessions')}>Sessions</NavBtn>
            )}
            <NavBtn active={screen === 'pair'} onClick={() => setScreen('pair')}>+ Connect</NavBtn>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 20, padding: '2px 6px' }}
            >✕</button>
          </div>
        </div>

        <div style={{ padding: '16px 20px 28px' }}>

          {/* Error / Success banners */}
          {error && (
            <div style={banner('red')}>
              <strong>!</strong> {error}
            </div>
          )}
          {successMsg && !error && (
            <div style={banner('green')}>
              ✓ {successMsg}
            </div>
          )}

          {/* ── SCREEN: session_proposal ─────────────────────────────────── */}
          {screen === 'proposal' && pendingProposal && (() => {
            const meta = pendingProposal.params?.proposer?.metadata || {};
            return (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  {meta.icons?.[0] && (
                    <img src={meta.icons[0]} alt={meta.name}
                      style={{ width: 64, height: 64, borderRadius: 16, margin: '0 auto 12px', display: 'block' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'white', marginBottom: 4 }}>
                    {meta.name || 'dApp'} wants to connect
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(240,246,255,0.5)' }}>{meta.url || ''}</div>
                </div>

                <InfoCard>
                  <InfoRow label="Your Wallet" value={addr ? short(addr) : 'Not connected'} />
                  <InfoRow label="Network" value="Solana Mainnet" />
                  <InfoRow label="Permissions" value="View address, request signing" last />
                </InfoCard>

                {!addr && (
                  <div style={banner('yellow')}>
                    Unlock your FiatWallet vault first before approving.
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <ActionBtn onClick={handleReject} variant="ghost">Reject</ActionBtn>
                  <ActionBtn onClick={handleApprove} loading={approving} disabled={!addr}>
                    Approve Connection
                  </ActionBtn>
                </div>
              </div>
            );
          })()}

          {/* ── SCREEN: session_request (sign transaction) ───────────────── */}
          {screen === 'request' && pendingRequest && (() => {
            const method = pendingRequest.params?.request?.method || 'Unknown';
            const sessionTopic = pendingRequest.topic;
            // Find matching session for dApp info
            const session = sessions.find((s) => s.topic === sessionTopic);
            const meta = session?.peer?.metadata || {};
            return (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  {meta.icons?.[0] && (
                    <img src={meta.icons[0]} alt={meta.name}
                      style={{ width: 52, height: 52, borderRadius: 13, margin: '0 auto 10px', display: 'block' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'white', marginBottom: 4 }}>
                    {meta.name || 'dApp'} Requests Signature
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(240,246,255,0.5)' }}>
                    {method === 'solana_signTransaction' && 'Sign a Solana transaction'}
                    {method === 'solana_signAllTransactions' && 'Sign multiple transactions'}
                    {method === 'solana_signAndSendTransaction' && 'Sign and submit transaction'}
                    {method === 'solana_signMessage' && 'Sign a message'}
                    {!method.startsWith('solana_') && method}
                  </div>
                </div>

                <InfoCard>
                  <InfoRow label="Action" value={method.replace('solana_', '')} />
                  <InfoRow label="Signer" value={addr ? short(addr) : 'Not unlocked'} last />
                </InfoCard>

                {!signTransaction && (
                  <div style={banner('yellow')}>
                    Your vault is locked. Please unlock FiatWallet first, then come back to approve this request.
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <ActionBtn onClick={handleSignReject} variant="ghost">Reject</ActionBtn>
                  <ActionBtn onClick={handleSignApprove} loading={signing} disabled={!signTransaction}>
                    Sign & Submit
                  </ActionBtn>
                </div>
              </div>
            );
          })()}

          {/* ── SCREEN: pair (URI input) ─────────────────────────────────── */}
          {screen === 'pair' && (
            <div>
              {/* Wallet address card */}
              <div style={{
                background: 'rgba(163,230,53,0.08)',
                border: '1px solid rgba(163,230,53,0.22)',
                borderRadius: 14, padding: '12px 16px', marginBottom: 20,
              }}>
                <div style={{ fontSize: 11, color: 'rgba(240,246,255,0.45)', marginBottom: 3 }}>Your FiatWallet (Solana)</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#a3e635', fontFamily: 'monospace' }}>
                  {addr ? `${addr.slice(0, 10)}...${addr.slice(-10)}` : 'Vault locked — unlock your wallet first'}
                </div>
              </div>

              {/* Step-by-step instructions */}
              <div style={{
                background: 'rgba(59,153,252,0.07)',
                border: '1px solid rgba(59,153,252,0.2)',
                borderRadius: 14, padding: '14px 16px', marginBottom: 20,
              }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#3b99fc', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  How to connect FiatWallet to any dApp
                </div>
                <ol style={{ margin: 0, padding: '0 0 0 16px', fontSize: 13, color: 'rgba(240,246,255,0.75)', lineHeight: 1.8 }}>
                  <li>Open a dApp from the Explorer (e.g. Raydium, Jupiter)</li>
                  <li>Tap <strong style={{ color: 'white' }}>Connect Wallet</strong> inside the dApp</li>
                  <li>Choose <strong style={{ color: '#3b99fc' }}>WalletConnect</strong> from the wallet list</li>
                  <li>The dApp shows a QR code — tap <strong style={{ color: 'white' }}>Copy Link</strong> on it</li>
                  <li>Come back to FiatWallet → tap the <strong style={{ color: '#3b99fc' }}>WC</strong> button → paste below</li>
                  <li>Tap <strong style={{ color: '#a3e635' }}>Connect</strong> and approve the session</li>
                </ol>
              </div>

              {/* URI input */}
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(240,246,255,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Paste WalletConnect URI
              </div>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <textarea
                  ref={inputRef}
                  value={wcUri}
                  onChange={(e) => { setWcUri(e.target.value); setError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doPair(); } }}
                  placeholder="wc:a1b2c3...@2?relay-protocol=irn&symKey=..."
                  rows={3}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'rgba(10,22,40,0.85)',
                    border: error ? '1px solid rgba(248,113,113,0.6)' : '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 12, padding: '12px 14px',
                    color: 'white', fontSize: 12, fontFamily: 'monospace',
                    resize: 'none', outline: 'none', lineHeight: 1.5,
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
                <ActionBtn onClick={handlePaste} variant="ghost" style={{ flex: '0 0 auto', padding: '12px 20px' }}>
                  Paste
                </ActionBtn>
                <ActionBtn onClick={() => doPair()} loading={pairing} disabled={!addr || !wcUri.trim()}>
                  Connect to dApp
                </ActionBtn>
              </div>
            </div>
          )}

          {/* ── SCREEN: active sessions list ─────────────────────────────── */}
          {screen === 'sessions' && (
            <div>
              {loadingSessions && (
                <div style={{ textAlign: 'center', color: 'rgba(240,246,255,0.4)', fontSize: 13, padding: '20px 0' }}>
                  Loading sessions...
                </div>
              )}

              {!loadingSessions && sessions.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 0 10px' }}>
                  <WCLogo size={48} style={{ opacity: 0.3, margin: '0 auto 12px', display: 'block' }} />
                  <div style={{ fontSize: 14, color: 'rgba(240,246,255,0.4)', marginBottom: 8 }}>No active sessions</div>
                  <div style={{ fontSize: 12, color: 'rgba(240,246,255,0.3)' }}>
                    Connect to a dApp to start a session.
                  </div>
                  <button
                    onClick={() => setScreen('pair')}
                    style={{
                      marginTop: 16, background: 'rgba(163,230,53,0.12)', border: '1px solid rgba(163,230,53,0.3)',
                      borderRadius: 10, padding: '10px 20px', color: '#a3e635',
                      fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Connect a dApp
                  </button>
                </div>
              )}

              {sessions.map((session) => {
                const meta = session.peer?.metadata || {};
                return (
                  <div key={session.topic} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12, marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {meta.icons?.[0] ? (
                        <img src={meta.icons[0]} alt={meta.name}
                          style={{ width: 36, height: 36, borderRadius: 10 }}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59,153,252,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <WCLogo size={18} />
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{meta.name || 'dApp'}</div>
                        <div style={{ fontSize: 11, color: 'rgba(240,246,255,0.4)', marginTop: 1 }}>
                          {addr ? short(addr) : ''} • Connected
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDisconnect(session.topic)}
                      style={{
                        background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.28)',
                        borderRadius: 8, color: '#f87171', fontSize: 11, fontWeight: 700,
                        padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                );
              })}

              {sessions.length > 0 && (
                <button
                  onClick={() => setScreen('pair')}
                  style={{
                    width: '100%', marginTop: 8,
                    background: 'rgba(163,230,53,0.08)', border: '1px solid rgba(163,230,53,0.25)',
                    borderRadius: 10, padding: '11px', color: '#a3e635',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  + Connect Another dApp
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Utility sub-components ─────────────────────────────────────────────────

function NavBtn({ children, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? 'rgba(163,230,53,0.12)' : 'rgba(255,255,255,0.05)',
      border: active ? '1px solid rgba(163,230,53,0.35)' : '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8, color: active ? '#a3e635' : 'rgba(240,246,255,0.5)',
      fontSize: 11, fontWeight: 700, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit',
    }}>
      {children}
    </button>
  );
}

function ActionBtn({ children, onClick, variant = 'primary', loading = false, disabled = false, style: s = {} }) {
  const isPrimary = variant === 'primary';
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      style={{
        flex: 1, padding: '13px 16px', borderRadius: 12,
        fontWeight: 700, fontSize: 13, cursor: loading || disabled ? 'not-allowed' : 'pointer',
        opacity: loading || disabled ? 0.55 : 1, transition: 'opacity 0.15s',
        fontFamily: 'inherit',
        ...(isPrimary
          ? { background: 'linear-gradient(135deg,#a3e635,#65a30d)', border: 'none', color: '#090d16' }
          : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }
        ),
        ...s,
      }}
    >
      {loading ? 'Please wait...' : children}
    </button>
  );
}

function InfoCard({ children }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

function InfoRow({ label, value, last = false }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px',
      borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ fontSize: 12, color: 'rgba(240,246,255,0.45)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

function WCLogo({ size = 20, style: s = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={s}>
      <circle cx="16" cy="16" r="16" fill="#3B99FC" />
      <path d="M9.58 12.74c3.54-3.45 9.28-3.45 12.82 0l.43.42a.44.44 0 0 1 0 .62l-1.47 1.44a.23.23 0 0 1-.32 0l-.59-.57c-2.47-2.41-6.47-2.41-8.94 0l-.63.62a.23.23 0 0 1-.32 0L9.08 13.8a.44.44 0 0 1 0-.62l.5-.44Zm15.84 2.94 1.31 1.28a.44.44 0 0 1 0 .62l-5.9 5.75a.45.45 0 0 1-.64 0l-4.18-4.08a.12.12 0 0 0-.16 0l-4.18 4.08a.45.45 0 0 1-.64 0L5.25 17.58a.44.44 0 0 1 0-.62l1.31-1.28a.45.45 0 0 1 .64 0l4.18 4.08a.12.12 0 0 0 .16 0l4.18-4.08a.45.45 0 0 1 .64 0l4.18 4.08a.12.12 0 0 0 .16 0l4.18-4.08a.45.45 0 0 1 .64 0Z" fill="white" />
    </svg>
  );
}

function banner(color) {
  const colors = {
    red: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', text: '#fca5a5' },
    green: { bg: 'rgba(163,230,53,0.1)', border: 'rgba(163,230,53,0.3)', text: '#a3e635' },
    yellow: { bg: 'rgba(234,179,8,0.1)', border: 'rgba(234,179,8,0.3)', text: '#fde047' },
  };
  const c = colors[color] || colors.red;
  return {
    background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10,
    padding: '10px 14px', fontSize: 12, color: c.text,
    lineHeight: 1.5, marginBottom: 14,
  };
}

function short(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
}
