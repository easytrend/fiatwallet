import { useState } from 'react';
import { importFromMnemonic, importFromPrivateKey } from '../services/walletCrypto';
import { decryptVault, loadVaultFromStorage, clearVaultFromStorage } from '../services/walletVault';
import bs58 from 'bs58';

// ── WalletUnlock ────────────────────────────────────────────
// Shown on app load when a vault exists but no in-memory keypair is active.
// User enters their PIN → vault decrypts → keypair goes into memory.

export default function WalletUnlock({ walletMeta, onUnlocked, onReset }) {
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

      // Plaintext is either a mnemonic (has spaces) or a base58 private key
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
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    clearVaultFromStorage();
    onReset();
  };

  const inputStyle = {
    width: '100%',
    padding: '14px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    color: 'white',
    fontSize: '15px',
    outline: 'none',
    textAlign: 'center',
    letterSpacing: '0.2em',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  const btnStyle = {
    width: '100%',
    padding: '14px',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '14px',
    color: 'white',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    marginBottom: '12px',
    transition: 'background 0.2s',
  };

  // Shorten public key for display
  const shortKey = walletMeta?.publicKey
    ? `${walletMeta.publicKey.slice(0, 6)}...${walletMeta.publicKey.slice(-6)}`
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '24px', background: 'var(--bg, #0a0a0f)' }}>
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '20px',
        padding: '32px 24px',
        maxWidth: '360px',
        width: '100%',
        color: 'white',
        textAlign: 'center',
      }}>
        <img src="/logo.png" alt="" style={{ width: '48px', height: '48px', marginBottom: '16px' }} onError={(e) => { e.target.style.display = 'none'; }} />

        <div style={{ fontSize: '20px', fontWeight: '800', marginBottom: '4px' }}>Welcome Back</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginBottom: '8px', fontFamily: 'monospace' }}>
          {shortKey}
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginBottom: '28px' }}>
          Enter your PIN to unlock your wallet
        </div>

        <input
          type="password"
          value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleUnlock(); }}
          placeholder="Enter PIN"
          style={inputStyle}
          autoFocus
          autoComplete="current-password"
        />

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#f87171', margin: '12px 0', textAlign: 'left', lineHeight: '1.5' }}>
            {error}
          </div>
        )}

        <button style={{ ...btnStyle, marginTop: '16px' }} onClick={handleUnlock} disabled={loading}>
          {loading ? 'Unlocking...' : 'Unlock'}
        </button>

        <button
          onClick={() => setShowReset(!showReset)}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: '12px', cursor: 'pointer', padding: '4px' }}
        >
          Forgot PIN / Reset Wallet
        </button>

        {showReset && (
          <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '12px', textAlign: 'left' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '6px', color: '#f87171' }}>Reset Wallet</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginBottom: '14px', lineHeight: '1.5' }}>
              This will permanently delete the encrypted vault from this device. Make sure you have your seed phrase before proceeding.
            </div>
            <button
              onClick={handleReset}
              style={{ ...btnStyle, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', marginBottom: 0 }}
            >
              I have my seed phrase — Reset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
