import { useState } from 'react';
import { importFromMnemonic, importFromPrivateKey } from '../services/walletCrypto';
import { decryptVault, loadVaultFromStorage, clearVaultFromStorage } from '../services/walletVault';
import logoImg from '../assets/logo.png';

export default function WalletUnlock({ walletMeta, onUnlocked, onReset, onConnectExternal, onContinueGuest }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const handleUnlock = async () => {
    if (!pin) { setError('Please enter your PIN.'); return; }
    setLoading(true);
    setError('');
    try {
      const vault = loadVaultFromStorage();
      if (!vault) throw new Error('No vault found. Please reset and create a new wallet.');
      const plaintext = await decryptVault(vault, pin);

      let secretKey;
      let mnemonic = null;

      if (plaintext.includes(' ')) {
        const result = await importFromMnemonic(plaintext, 0);
        secretKey = result.secretKey;
        mnemonic = result.mnemonic;
      } else {
        const result = importFromPrivateKey(plaintext);
        secretKey = result.secretKey;
      }

      onUnlocked({
        publicKey: walletMeta.publicKey,
        secretKey,
        mnemonic,
        source: walletMeta.source,
      });
    } catch (e) {
      setError(e.message || 'Incorrect PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    clearVaultFromStorage();
    onReset();
  };

  const cardStyle = {
    background: 'var(--card, #111e38)',
    border: '1px solid var(--border, rgba(255,255,255,0.09))',
    borderRadius: '24px',
    padding: '36px 26px',
    maxWidth: '380px',
    width: '100%',
    margin: '0 auto',
    color: 'var(--text, #f0f6ff)',
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45), 0 0 20px rgba(34, 211, 238, 0.05)',
    backdropFilter: 'blur(16px)',
    fontFamily: 'var(--ff, sans-serif)',
    textAlign: 'center',
  };

  const inputStyle = {
    width: '100%',
    padding: '14px',
    background: 'rgba(10, 22, 40, 0.75)',
    border: '1px solid var(--border, rgba(255,255,255,0.09))',
    borderRadius: '12px',
    color: 'var(--text, #f0f6ff)',
    fontSize: '18px',
    outline: 'none',
    textAlign: 'center',
    letterSpacing: '0.25em',
    boxSizing: 'border-box',
    fontFamily: 'var(--mono, monospace)',
    transition: 'border-color 0.2s',
  };

  const btnPrimary = {
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, rgba(163,230,53,0.18), rgba(163,230,53,0.08))',
    border: '1px solid rgba(163,230,53,0.4)',
    borderRadius: '14px',
    color: 'var(--lime, #a3e635)',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '16px',
    marginBottom: '14px',
    transition: 'all 0.2s',
    letterSpacing: '0.01em',
  };

  const shortKey = walletMeta?.publicKey
    ? `${walletMeta.publicKey.slice(0, 4)}...${walletMeta.publicKey.slice(-4)}`
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '85vh', padding: '24px 16px', position: 'relative', zIndex: 1 }}>
      <div style={cardStyle}>
        <img src={logoImg} alt="Fiatwallet" style={{ width: '56px', height: '56px', objectFit: 'contain', marginBottom: '14px' }} />

        <h1 style={{ fontSize: '22px', fontWeight: '800', margin: 0, color: 'white' }}>Welcome Back</h1>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.04)', padding: '4px 10px', borderRadius: '12px', marginTop: '10px', marginBottom: '16px', border: '1px solid var(--border)' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--lime)' }} />
          <span style={{ fontSize: '12px', color: 'var(--text2)', fontFamily: 'var(--mono, monospace)' }}>{shortKey}</span>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text2)', marginTop: 0, marginBottom: '22px' }}>
          Enter your PIN to unlock your local wallet
        </p>

        <input
          type="password"
          value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleUnlock(); }}
          placeholder="••••••"
          style={inputStyle}
          autoFocus
          autoComplete="current-password"
        />

        {error && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: 'var(--red, #f87171)', margin: '14px 0', textAlign: 'center', lineHeight: '1.5' }}>
            {error}
          </div>
        )}

        <button style={btnPrimary} onClick={handleUnlock} disabled={loading}>
          {loading ? 'Unlocking...' : 'Unlock Wallet'}
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', marginTop: '10px' }}>
          {onConnectExternal && (
            <button
              onClick={onConnectExternal}
              style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: '12px', cursor: 'pointer', padding: '4px' }}
            >
              or connect with Phantom / Solflare
            </button>
          )}

          {onContinueGuest && (
            <button
              onClick={onContinueGuest}
              style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '12px', cursor: 'pointer', padding: '4px' }}
            >
              continue as Guest
            </button>
          )}

          <button
            onClick={() => setShowReset(!showReset)}
            style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.7)', fontSize: '11px', cursor: 'pointer', marginTop: '6px' }}
          >
            Forgot PIN / Reset Wallet
          </button>
        </div>

        {showReset && (
          <div style={{ marginTop: '18px', padding: '16px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: '14px', textAlign: 'left' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '6px', color: 'var(--red, #f87171)' }}>Reset Local Wallet</div>
            <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '14px', lineHeight: '1.5' }}>
              This wipes the encrypted vault from this browser. You can restore later with your 12-word seed phrase.
            </div>
            <button
              onClick={handleReset}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(248,113,113,0.15)',
                border: '1px solid var(--red, #f87171)',
                borderRadius: '10px',
                color: 'var(--red, #f87171)',
                fontWeight: '700',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              I have my seed phrase — Reset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
