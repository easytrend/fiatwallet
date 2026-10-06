import { useState, useEffect, useRef } from 'react';
import {
  pairWithUri,
  approveSessionProposal,
  rejectSessionProposal,
  respondToRequest,
  rejectRequest,
  getActiveSessions,
  disconnectSession,
  handleSessionRequest,
  getWeb3Wallet,
} from '../services/walletConnectService';

/**
 * WalletConnectModal
 *
 * Renders the FiatWallet WalletConnect v2 pairing/session UI.
 * Shown as a bottom sheet inside the dApp explorer.
 *
 * Props:
 *   open          {boolean}   - Visibility
 *   onClose       {function}  - Dismiss modal
 *   publicKey     {object}    - FiatWallet public key (has .toBase58())
 *   signTransaction {function} - Wallet sign fn
 *   connection    {object}    - Solana Connection
 */
export default function WalletConnectModal({
  open,
  onClose,
  publicKey,
  signTransaction,
  connection,
}) {
  const [wcUri, setWcUri] = useState('');
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState(null);

  // Session proposal waiting for user approval
  const [pendingProposal, setPendingProposal] = useState(null);
  const [approving, setApproving] = useState(false);

  // Pending sign request
  const [pendingRequest, setPendingRequest] = useState(null);
  const [signing, setSigning] = useState(false);

  // Active sessions list
  const [activeSessions, setActiveSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Status message
  const [statusMsg, setStatusMsg] = useState(null);

  const inputRef = useRef(null);

  // Initialize Web3Wallet and listen to events when modal opens
  useEffect(() => {
    if (!open) return;

    let mounted = true;

    // Pre-warm the WC SDK
    getWeb3Wallet().catch(() => {});

    // Load active sessions
    (async () => {
      setLoadingSessions(true);
      try {
        const sessions = await getActiveSessions();
        if (mounted) setActiveSessions(Object.values(sessions || {}));
      } catch {
        // Ignore if not yet initialized
      } finally {
        if (mounted) setLoadingSessions(false);
      }
    })();

    const onProposal = (e) => {
      if (mounted) setPendingProposal(e.detail);
    };

    const onRequest = (e) => {
      if (mounted) setPendingRequest(e.detail);
    };

    const onDelete = () => {
      if (!mounted) return;
      setStatusMsg('Session disconnected by dApp.');
      getActiveSessions().then((s) => {
        if (mounted) setActiveSessions(Object.values(s || {}));
      }).catch(() => {});
    };

    window.addEventListener('fiatwallet:wc-session-proposal', onProposal);
    window.addEventListener('fiatwallet:wc-session-request', onRequest);
    window.addEventListener('fiatwallet:wc-session-delete', onDelete);

    return () => {
      mounted = false;
      window.removeEventListener('fiatwallet:wc-session-proposal', onProposal);
      window.removeEventListener('fiatwallet:wc-session-request', onRequest);
      window.removeEventListener('fiatwallet:wc-session-delete', onDelete);
    };
  }, [open]);

  // Focus input when modal opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setWcUri(text.trim());
    } catch {
      // Clipboard not available
    }
  };

  const handlePair = async () => {
    const uri = wcUri.trim();
    if (!uri || !uri.startsWith('wc:')) {
      setPairError('Please paste a valid WalletConnect URI (starts with wc:...)');
      return;
    }

    setPairing(true);
    setPairError(null);
    setStatusMsg(null);

    try {
      await pairWithUri(uri);
      setWcUri('');
      setStatusMsg('Pairing complete — waiting for dApp session proposal...');
    } catch (err) {
      setPairError(err.message || 'Pairing failed. URI may be expired. Get a fresh QR from the dApp.');
    } finally {
      setPairing(false);
    }
  };

  const handleApprove = async () => {
    if (!pendingProposal || !publicKey) return;
    setApproving(true);
    try {
      await approveSessionProposal(pendingProposal, publicKey.toBase58());
      setPendingProposal(null);
      setStatusMsg('Connected to dApp via WalletConnect.');
      // Refresh sessions
      const sessions = await getActiveSessions();
      setActiveSessions(Object.values(sessions || {}));
    } catch (err) {
      setPairError(err.message || 'Approval failed.');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!pendingProposal) return;
    try {
      await rejectSessionProposal(pendingProposal);
    } catch { /* ignore */ }
    setPendingProposal(null);
  };

  const handleSignApprove = async () => {
    if (!pendingRequest || !signTransaction) return;
    setSigning(true);
    try {
      const result = await handleSessionRequest(pendingRequest, signTransaction, connection);
      await respondToRequest(pendingRequest, result);
      setPendingRequest(null);
      setStatusMsg('Transaction signed and sent to dApp.');
    } catch (err) {
      await rejectRequest(pendingRequest, err.message || 'Signing failed').catch(() => {});
      setPendingRequest(null);
      setPairError(err.message || 'Signing failed.');
    } finally {
      setSigning(false);
    }
  };

  const handleSignReject = async () => {
    if (!pendingRequest) return;
    await rejectRequest(pendingRequest).catch(() => {});
    setPendingRequest(null);
  };

  const handleDisconnect = async (topic) => {
    try {
      await disconnectSession(topic);
      setActiveSessions((prev) => prev.filter((s) => s.topic !== topic));
      setStatusMsg('Session disconnected.');
    } catch { /* ignore */ }
  };

  if (!open) return null;

  const addr = publicKey ? publicKey.toBase58() : null;

  // ── Session Proposal Screen ───────────────────────────────────────────────
  if (pendingProposal) {
    const meta = pendingProposal.params?.proposer?.metadata || {};
    return (
      <Overlay onClose={onClose}>
        <Sheet>
          <SheetHeader title="Connect dApp?" onClose={onClose} />
          <div style={{ padding: '0 20px 20px' }}>
            {meta.icons?.[0] && (
              <img src={meta.icons[0]} alt={meta.name} style={{ width: 56, height: 56, borderRadius: 14, marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
            )}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'white', marginBottom: 4 }}>{meta.name || 'Unknown dApp'}</div>
              <div style={{ fontSize: 12, color: 'rgba(240,246,255,0.5)' }}>{meta.url || ''}</div>
            </div>

            <InfoRow label="Your Wallet" value={`${addr?.slice(0, 6)}...${addr?.slice(-6)}`} />
            <InfoRow label="Network" value="Solana Mainnet" />

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <Btn onClick={handleReject} variant="ghost">Reject</Btn>
              <Btn onClick={handleApprove} loading={approving}>Approve Connection</Btn>
            </div>
          </div>
        </Sheet>
      </Overlay>
    );
  }

  // ── Sign Request Screen ───────────────────────────────────────────────────
  if (pendingRequest) {
    const method = pendingRequest.params?.request?.method || 'Unknown';
    return (
      <Overlay onClose={onClose}>
        <Sheet>
          <SheetHeader title="Approve Transaction?" onClose={onClose} />
          <div style={{ padding: '0 20px 20px' }}>
            <InfoRow label="Action" value={method} />
            {!signTransaction && (
              <div style={warningStyle}>
                Unlock your FiatWallet vault to sign transactions.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <Btn onClick={handleSignReject} variant="ghost">Reject</Btn>
              <Btn onClick={handleSignApprove} loading={signing} disabled={!signTransaction}>
                Sign & Submit
              </Btn>
            </div>
          </div>
        </Sheet>
      </Overlay>
    );
  }

  // ── Main Pairing Screen ───────────────────────────────────────────────────
  return (
    <Overlay onClose={onClose}>
      <Sheet>
        <SheetHeader title="WalletConnect" onClose={onClose} />
        <div style={{ padding: '0 20px 24px' }}>

          {/* Wallet Address */}
          <div style={{
            background: 'rgba(163, 230, 53, 0.08)',
            border: '1px solid rgba(163, 230, 53, 0.25)',
            borderRadius: 12,
            padding: '10px 14px',
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 11, color: 'rgba(240,246,255,0.5)', marginBottom: 2 }}>Your FiatWallet Address</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#a3e635', fontFamily: 'monospace' }}>
              {addr ? `${addr.slice(0, 8)}...${addr.slice(-8)}` : 'Wallet not connected'}
            </div>
          </div>

          {/* Instructions */}
          <div style={{ fontSize: 13, color: 'rgba(240,246,255,0.65)', lineHeight: 1.6, marginBottom: 16 }}>
            <strong style={{ color: 'white' }}>How to connect:</strong>
            <ol style={{ margin: '8px 0 0 0', paddingLeft: 18 }}>
              <li>Open any dApp (Raydium, Jupiter, etc.) in FiatWallet Explorer.</li>
              <li>Tap <strong style={{ color: '#a3e635' }}>Connect Wallet</strong> inside the dApp.</li>
              <li>Choose <strong style={{ color: '#a3e635' }}>WalletConnect</strong> from the wallet list.</li>
              <li>Copy the WC URI or scan the QR code it shows.</li>
              <li>Paste the URI below and tap <strong style={{ color: '#a3e635' }}>Connect</strong>.</li>
            </ol>
          </div>

          {/* URI Input */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <textarea
              ref={inputRef}
              value={wcUri}
              onChange={(e) => { setWcUri(e.target.value); setPairError(null); }}
              placeholder="Paste WalletConnect URI here (wc:...)"
              rows={3}
              style={{
                width: '100%',
                background: 'rgba(10, 22, 40, 0.85)',
                border: pairError ? '1px solid #f87171' : '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12,
                padding: '12px 14px',
                color: 'white',
                fontSize: 12,
                fontFamily: 'monospace',
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {pairError && (
            <div style={{ fontSize: 12, color: '#f87171', marginBottom: 10 }}>{pairError}</div>
          )}

          {statusMsg && (
            <div style={{ fontSize: 12, color: '#a3e635', marginBottom: 10 }}>{statusMsg}</div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <Btn onClick={handlePaste} variant="ghost" style={{ flex: 1 }}>Paste URI</Btn>
            <Btn onClick={handlePair} loading={pairing} disabled={!addr} style={{ flex: 2 }}>
              Connect via WC
            </Btn>
          </div>

          {/* Active Sessions */}
          {activeSessions.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(240,246,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Active Sessions
              </div>
              {activeSessions.map((session) => {
                const meta = session.peer?.metadata || {};
                return (
                  <div key={session.topic} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    marginBottom: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {meta.icons?.[0] && (
                        <img src={meta.icons[0]} alt={meta.name} style={{ width: 28, height: 28, borderRadius: 7 }} />
                      )}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{meta.name || 'dApp'}</div>
                        <div style={{ fontSize: 11, color: 'rgba(240,246,255,0.45)' }}>{meta.url || ''}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDisconnect(session.topic)}
                      style={{
                        background: 'rgba(248, 113, 113, 0.12)',
                        border: '1px solid rgba(248, 113, 113, 0.3)',
                        borderRadius: 8,
                        color: '#f87171',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '5px 10px',
                        cursor: 'pointer',
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {loadingSessions && (
            <div style={{ fontSize: 12, color: 'rgba(240,246,255,0.4)', textAlign: 'center', padding: '10px 0' }}>
              Loading sessions...
            </div>
          )}
        </div>
      </Sheet>
    </Overlay>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function Overlay({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999999,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520 }}>
        {children}
      </div>
    </div>
  );
}

function Sheet({ children }) {
  return (
    <div style={{
      background: '#0d1f3c',
      borderRadius: '20px 20px 0 0',
      border: '1px solid rgba(255,255,255,0.08)',
      maxHeight: '92vh',
      overflowY: 'auto',
    }}>
      {children}
    </div>
  );
}

function SheetHeader({ title, onClose }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 20px 12px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* WC Logo */}
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#3B99FC" />
          <path d="M9.58 12.74c3.54-3.45 9.28-3.45 12.82 0l.43.42a.44.44 0 0 1 0 .62l-1.47 1.44a.23.23 0 0 1-.32 0l-.59-.57c-2.47-2.41-6.47-2.41-8.94 0l-.63.62a.23.23 0 0 1-.32 0L9.08 13.8a.44.44 0 0 1 0-.62l.5-.44Zm15.84 2.94 1.31 1.28a.44.44 0 0 1 0 .62l-5.9 5.75a.45.45 0 0 1-.64 0l-4.18-4.08a.12.12 0 0 0-.16 0l-4.18 4.08a.45.45 0 0 1-.64 0L5.25 17.58a.44.44 0 0 1 0-.62l1.31-1.28a.45.45 0 0 1 .64 0l4.18 4.08a.12.12 0 0 0 .16 0l4.18-4.08a.45.45 0 0 1 .64 0l4.18 4.08a.12.12 0 0 0 .16 0l4.18-4.08a.45.45 0 0 1 .64 0Z" fill="white" />
        </svg>
        <span style={{ fontSize: 16, fontWeight: 800, color: 'white' }}>{title}</span>
      </div>
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 18, padding: 4 }}
      >
        ✕
      </button>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span style={{ fontSize: 12, color: 'rgba(240,246,255,0.5)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

function Btn({ children, onClick, variant = 'primary', loading = false, disabled = false, style = {} }) {
  const isPrimary = variant === 'primary';
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      style={{
        flex: 1,
        padding: '12px 16px',
        borderRadius: 12,
        fontWeight: 700,
        fontSize: 13,
        cursor: loading || disabled ? 'not-allowed' : 'pointer',
        opacity: loading || disabled ? 0.6 : 1,
        transition: 'opacity 0.15s',
        fontFamily: 'inherit',
        ...(isPrimary
          ? { background: 'linear-gradient(135deg, #a3e635, #65a30d)', border: 'none', color: '#090d16' }
          : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }
        ),
        ...style,
      }}
    >
      {loading ? 'Please wait...' : children}
    </button>
  );
}

const warningStyle = {
  background: 'rgba(239, 68, 68, 0.1)',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  borderRadius: 10,
  padding: '10px 14px',
  fontSize: 12,
  color: '#fca5a5',
  marginBottom: 12,
};
