import { useState } from 'react';
import { loadVaultFromStorage, decryptVault, encryptVault, saveVaultToStorage, clearVaultFromStorage } from '../services/walletVault';

export default function SecurityModal({ walletAddress, isInternal, onClose, onLock, onLogout }) {
  const [activeTab, setActiveTab] = useState('seed'); // 'seed' | 'pin' | 'danger'
  const [pin, setPin] = useState('');
  const [revealedSecret, setRevealedSecret] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Change PIN states
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // 1. Reveal Seed Phrase with PIN
  const handleRevealSeed = async (e) => {
    e.preventDefault();
    if (!pin) { setError('Please enter your 6-digit PIN.'); return; }
    setError('');
    setLoading(true);
    try {
      const vault = loadVaultFromStorage();
      if (!vault) throw new Error('No encrypted vault found on this device.');
      const secret = await decryptVault(vault, pin);
      setRevealedSecret(secret);
      setPin('');
    } catch (err) {
      setError(err.message || 'Incorrect PIN.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Change PIN
  const handleChangePin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!oldPin || !newPin || !confirmPin) {
      setError('Please fill in all PIN fields.');
      return;
    }
    if (newPin.length < 6) {
      setError('New PIN must be at least 6 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('New PIN and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      const vault = loadVaultFromStorage();
      if (!vault) throw new Error('No vault found.');
      // Verify old PIN
      const secret = await decryptVault(vault, oldPin);
      // Re-encrypt with new PIN
      const newVault = await encryptVault(secret, newPin);
      saveVaultToStorage(newVault);

      setSuccess('Security PIN changed successfully!');
      setOldPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      setError(err.message || 'Failed to change PIN. Verify your current PIN.');
    } finally {
      setLoading(false);
    }
  };

  const words = revealedSecret && revealedSecret.includes(' ') ? revealedSecret.split(' ') : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(5, 11, 20, 0.85)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'var(--card, #111e38)',
          border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
          borderRadius: '24px',
          padding: '24px 22px',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.6)',
          fontFamily: 'var(--ff, sans-serif)',
          color: 'var(--text, #f0f6ff)',
          position: 'relative',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: 'var(--text2, rgba(240, 246, 255, 0.6))',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          ✕
        </button>

        <h3 style={{ fontSize: '18px', fontWeight: '800', margin: '0 0 6px 0', color: 'white' }}>
          Wallet Settings &amp; Security
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text2, rgba(240, 246, 255, 0.6))', margin: '0 0 18px 0' }}>
          {isInternal ? 'Self-custodial local wallet' : 'Connected external wallet'}
        </p>

        {/* Tab Headers */}
        {isInternal && (
          <div style={{
            display: 'flex',
            background: 'rgba(10, 22, 40, 0.8)',
            padding: '4px',
            borderRadius: '12px',
            marginBottom: '18px',
            border: '1px solid var(--border)',
          }}>
            <button
              onClick={() => { setActiveTab('seed'); setError(''); setSuccess(''); }}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'seed' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                color: activeTab === 'seed' ? 'white' : 'var(--text2)',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Seed Phrase
            </button>
            <button
              onClick={() => { setActiveTab('pin'); setError(''); setSuccess(''); }}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'pin' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                color: activeTab === 'pin' ? 'white' : 'var(--text2)',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Change PIN
            </button>
            <button
              onClick={() => { setActiveTab('danger'); setError(''); setSuccess(''); }}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'danger' ? 'rgba(248, 113, 113, 0.15)' : 'transparent',
                color: activeTab === 'danger' ? 'var(--red, #f87171)' : 'var(--text2)',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Manage
            </button>
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(248, 113, 113, 0.1)',
            border: '1px solid rgba(248, 113, 113, 0.3)',
            borderRadius: '12px',
            padding: '10px 14px',
            fontSize: '12px',
            color: 'var(--red, #f87171)',
            marginBottom: '16px',
            lineHeight: '1.4',
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            background: 'rgba(163, 230, 53, 0.1)',
            border: '1px solid rgba(163, 230, 53, 0.3)',
            borderRadius: '12px',
            padding: '10px 14px',
            fontSize: '12px',
            color: 'var(--lime, #a3e635)',
            marginBottom: '16px',
            lineHeight: '1.4',
          }}>
            ✓ {success}
          </div>
        )}

        {/* ── TAB 1: REVEAL SEED PHRASE ── */}
        {isInternal && activeTab === 'seed' && (
          <div>
            {!revealedSecret ? (
              <form onSubmit={handleRevealSeed}>
                <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '14px', lineHeight: '1.5' }}>
                  Enter your 6-digit security PIN to decrypt and reveal your master seed phrase.
                </div>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={10}
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  placeholder="Enter PIN"
                  style={{
                    width: '100%',
                    padding: '14px',
                    background: 'rgba(10, 22, 40, 0.8)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    color: 'white',
                    fontSize: '16px',
                    textAlign: 'center',
                    letterSpacing: '0.2em',
                    outline: 'none',
                    fontFamily: 'var(--mono)',
                    marginBottom: '16px',
                    boxSizing: 'border-box',
                  }}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={loading || !pin}
                  style={{
                    width: '100%',
                    padding: '14px',
                    background: 'linear-gradient(135deg, rgba(163, 230, 53, 0.2), rgba(163, 230, 53, 0.08))',
                    border: '1px solid rgba(163, 230, 53, 0.4)',
                    borderRadius: '14px',
                    color: 'var(--lime, #a3e635)',
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  {loading ? 'Decrypting...' : 'Reveal Master Phrase'}
                </button>
              </form>
            ) : (
              <div>
                <div style={{
                  background: 'rgba(234, 179, 8, 0.1)',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  fontSize: '11px',
                  color: '#fef08a',
                  marginBottom: '14px',
                  lineHeight: '1.5',
                }}>
                  Never share these 12 words with anyone. Anyone who has them can steal all your assets.
                </div>

                {words ? (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                    marginBottom: '16px',
                  }}>
                    {words.map((w, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: 'rgba(10, 22, 40, 0.85)',
                          border: '1px solid var(--border)',
                          borderRadius: '10px',
                          padding: '10px 6px',
                          textAlign: 'center',
                        }}
                      >
                        <span style={{ fontSize: '10px', color: 'var(--text3)', display: 'block' }}>{idx + 1}</span>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: 'white', fontFamily: 'var(--mono)' }}>{w}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    background: 'rgba(10, 22, 40, 0.85)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '12px',
                    fontFamily: 'var(--mono)',
                    fontSize: '11px',
                    wordBreak: 'break-all',
                    color: 'white',
                    marginBottom: '16px',
                  }}>
                    {revealedSecret}
                  </div>
                )}

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(revealedSecret);
                    setSuccess('Copied to clipboard!');
                    setTimeout(() => setSuccess(''), 2000);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border2, rgba(255, 255, 255, 0.15))',
                    borderRadius: '12px',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  Copy to Clipboard
                </button>

                <button
                  onClick={() => setRevealedSecret(null)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text3)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Hide Secret
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: CHANGE PIN ── */}
        {isInternal && activeTab === 'pin' && (
          <form onSubmit={handleChangePin}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text2)', marginBottom: '6px', textTransform: 'uppercase' }}>
                Current PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={10}
                value={oldPin}
                onChange={e => setOldPin(e.target.value)}
                placeholder="Current PIN"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'rgba(10, 22, 40, 0.8)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none',
                  fontFamily: 'var(--mono)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text2)', marginBottom: '6px', textTransform: 'uppercase' }}>
                New 6-Digit PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={10}
                value={newPin}
                onChange={e => setNewPin(e.target.value)}
                placeholder="New PIN (min 6 digits)"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'rgba(10, 22, 40, 0.8)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none',
                  fontFamily: 'var(--mono)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text2)', marginBottom: '6px', textTransform: 'uppercase' }}>
                Confirm New PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={10}
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value)}
                placeholder="Re-enter New PIN"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'rgba(10, 22, 40, 0.8)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none',
                  fontFamily: 'var(--mono)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                background: 'linear-gradient(135deg, rgba(163, 230, 53, 0.2), rgba(163, 230, 53, 0.08))',
                border: '1px solid rgba(163, 230, 53, 0.4)',
                borderRadius: '14px',
                color: 'var(--lime, #a3e635)',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              {loading ? 'Updating...' : 'Update PIN'}
            </button>
          </form>
        )}

        {/* ── TAB 3: DANGER ZONE / LOCK / LOGOUT ── */}
        {(activeTab === 'danger' || !isInternal) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{
              background: 'rgba(10, 22, 40, 0.6)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              padding: '14px',
            }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'white', marginBottom: '4px' }}>
                Connected Address
              </div>
              <div style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text2)', wordBreak: 'break-all' }}>
                {walletAddress}
              </div>
            </div>

            {isInternal && (
              <button
                onClick={onLock}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border2)',
                  borderRadius: '14px',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                Lock Wallet (Require PIN)
              </button>
            )}

            <button
              onClick={onLogout}
              style={{
                width: '100%',
                padding: '14px',
                background: 'rgba(248, 113, 113, 0.1)',
                border: '1px solid rgba(248, 113, 113, 0.3)',
                borderRadius: '14px',
                color: 'var(--red, #f87171)',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              {isInternal ? 'Reset & Logout from Device' : 'Disconnect External Wallet'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
