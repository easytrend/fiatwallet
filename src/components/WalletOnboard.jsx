import { useState, useRef, useEffect } from 'react';
import * as bip39 from 'bip39';
import bs58 from 'bs58';
import { createNewWallet, importFromMnemonic, importFromPrivateKey } from '../services/walletCrypto';
import { encryptVault, saveVaultToStorage, saveWalletMeta } from '../services/walletVault';

// ── Screen states for the onboarding flow ────────────────────
// onboard → create-edu → create-reveal → create-verify → create-pin
//         → import-choose → import-mnemonic → import-key     → create-pin
//         (connect wallet is handled by parent via useWalletModal)

export default function WalletOnboard({ onWalletReady, onConnectExternal }) {
  const [screen, setScreen] = useState('onboard');

  // Create flow
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [isSeedRevealed, setIsSeedRevealed] = useState(false);
  const [screenshotAttempted, setScreenshotAttempted] = useState(false);
  const [hasAcknowledgedEdu, setHasAcknowledgedEdu] = useState(false);

  // Verification quiz
  const [quizStep, setQuizStep] = useState(1);
  const [quizTargetIndex, setQuizTargetIndex] = useState(0);
  const [quizWordPool, setQuizWordPool] = useState([]);
  const [quizSelectedWord, setQuizSelectedWord] = useState(null);
  const [quizStatus, setQuizStatus] = useState('idle');

  // Import flow
  const [importMode, setImportMode] = useState('mnemonic'); // 'mnemonic' | 'key'
  const [mnemonicInput, setMnemonicInput] = useState('');
  const [wordCount, setWordCount] = useState(12);
  const [importWords, setImportWords] = useState(Array(12).fill(''));
  const [inputMode, setInputMode] = useState('paste'); // 'paste' | 'grid'
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [isKeyHidden, setIsKeyHidden] = useState(true);

  // PIN setup (shared by create & import)
  const [pendingSecretKey, setPendingSecretKey] = useState(null); // Uint8Array
  const [pendingMnemonic, setPendingMnemonic] = useState('');
  const [pendingPublicKey, setPendingPublicKey] = useState('');
  const [pendingSource, setPendingSource] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');

  // General
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Screenshot protection on reveal screen ───────────────────
  useEffect(() => {
    if (screen !== 'create-reveal') return;
    const handleKey = (e) => {
      if (e.key === 'PrintScreen') {
        setIsSeedRevealed(false);
        setScreenshotAttempted(true);
      }
    };
    const handleVisibility = () => {
      if (document.hidden) setIsSeedRevealed(false);
    };
    window.addEventListener('keyup', handleKey);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('keyup', handleKey);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [screen]);

  // ── Sync word count grid ─────────────────────────────────────
  useEffect(() => {
    setImportWords(Array(wordCount).fill(''));
    setMnemonicInput('');
  }, [wordCount]);

  // ════════════════════════════════════════════════════════════
  // FLOW: CREATE WALLET
  // ════════════════════════════════════════════════════════════
  const handleStartCreate = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await createNewWallet();
      setGeneratedMnemonic(result.mnemonic);
      setPendingSecretKey(result.secretKey);
      setPendingPublicKey(result.publicKey);
      setPendingSource('created');
      setPendingMnemonic(result.mnemonic);
      setIsSeedRevealed(false);
      setHasAcknowledgedEdu(false);
      setScreenshotAttempted(false);
      setScreen('create-edu');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const startQuiz = () => {
    const words = generatedMnemonic.split(' ');
    const targetIdx = 2;
    setQuizTargetIndex(targetIdx);
    setQuizStep(1);
    const correct = words[targetIdx];
    const wordlist = bip39.wordlists['english'];
    const pool = new Set([correct]);
    while (pool.size < 6) pool.add(wordlist[Math.floor(Math.random() * wordlist.length)]);
    setQuizWordPool([...pool].sort(() => Math.random() - 0.5));
    setQuizSelectedWord(null);
    setQuizStatus('idle');
    setScreen('create-verify');
  };

  const handleQuizSelect = (word) => {
    const words = generatedMnemonic.split(' ');
    setQuizSelectedWord(word);
    if (word === words[quizTargetIndex]) {
      setQuizStatus('correct');
      if (quizStep === 1) {
        setTimeout(() => {
          const nextIdx = 7;
          setQuizTargetIndex(nextIdx);
          setQuizStep(2);
          const next = words[nextIdx];
          const wordlist = bip39.wordlists['english'];
          const nextPool = new Set([next]);
          while (nextPool.size < 6) nextPool.add(wordlist[Math.floor(Math.random() * wordlist.length)]);
          setQuizWordPool([...nextPool].sort(() => Math.random() - 0.5));
          setQuizSelectedWord(null);
          setQuizStatus('idle');
        }, 600);
      } else {
        setTimeout(() => setScreen('create-pin'), 600);
      }
    } else {
      setQuizStatus('wrong');
      setTimeout(() => { setQuizSelectedWord(null); setQuizStatus('idle'); }, 900);
    }
  };

  // ════════════════════════════════════════════════════════════
  // FLOW: IMPORT WALLET
  // ════════════════════════════════════════════════════════════
  const handleImportMnemonic = async () => {
    setLoading(true);
    setError('');
    try {
      const phrase = inputMode === 'paste'
        ? mnemonicInput.trim()
        : importWords.join(' ').trim();
      const result = await importFromMnemonic(phrase, 0);
      setPendingSecretKey(result.secretKey);
      setPendingPublicKey(result.publicKey);
      setPendingMnemonic(result.mnemonic);
      setPendingSource('imported-mnemonic');
      setScreen('create-pin');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportPrivateKey = async () => {
    setLoading(true);
    setError('');
    try {
      const result = importFromPrivateKey(privateKeyInput.trim());
      setPendingSecretKey(result.secretKey);
      setPendingPublicKey(result.publicKey);
      setPendingMnemonic('');
      setPendingSource('imported-privatekey');
      setScreen('create-pin');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ════════════════════════════════════════════════════════════
  // FLOW: PIN SETUP & SAVE
  // ════════════════════════════════════════════════════════════
  const handleSetPin = async () => {
    setPinError('');
    if (pin.length < 6) { setPinError('PIN must be at least 6 characters.'); return; }
    if (pin !== pinConfirm) { setPinError('PINs do not match. Please try again.'); return; }
    setLoading(true);
    try {
      // Encrypt the secret material (mnemonic if available, otherwise base58 key)
      const secretMaterial = pendingMnemonic || bs58.encode(pendingSecretKey);
      const vault = await encryptVault(secretMaterial, pin);
      saveVaultToStorage(vault);
      saveWalletMeta(pendingPublicKey, pendingSource);
      // Hand off to parent with the in-memory keypair (never stored plain)
      onWalletReady({
        publicKey: pendingPublicKey,
        secretKey: pendingSecretKey,
        mnemonic: pendingMnemonic || null,
        source: pendingSource,
      });
    } catch (e) {
      setPinError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ════════════════════════════════════════════════════════════
  // RENDER HELPERS
  // ════════════════════════════════════════════════════════════
  const words = generatedMnemonic ? generatedMnemonic.split(' ') : [];

  const baseCard = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '20px',
    padding: '28px 24px',
    maxWidth: '400px',
    width: '100%',
    margin: '0 auto',
    color: 'white',
  };

  const btnPrimary = {
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
    letterSpacing: '0.01em',
  };

  const btnSecondary = {
    ...btnPrimary,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.5)',
    fontSize: '13px',
    fontWeight: '500',
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    color: 'white',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  const labelStyle = {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.45)',
    marginBottom: '6px',
    display: 'block',
    fontWeight: '500',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };

  const errorBox = error ? (
    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#f87171', marginBottom: '14px', lineHeight: '1.5' }}>
      {error}
    </div>
  ) : null;

  // ── SCREEN: Onboard (landing) ─────────────────────────────
  if (screen === 'onboard') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '24px', background: 'var(--bg, #0a0a0f)' }}>
        <div style={baseCard}>
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <img src="/logo.png" alt="Fiatwallet" style={{ width: '60px', height: '60px', marginBottom: '16px' }} onError={(e) => { e.target.style.display = 'none'; }} />
            <div style={{ fontSize: '22px', fontWeight: '800', letterSpacing: '-0.02em', marginBottom: '6px' }}>Fiatwallet</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', lineHeight: '1.5' }}>Your keys. Your crypto. Your fiat.</div>
          </div>

          <button style={btnPrimary} onClick={onConnectExternal}>Connect Wallet</button>
          <button style={btnPrimary} onClick={handleStartCreate} disabled={loading}>
            {loading ? 'Generating...' : 'Create Wallet'}
          </button>
          <button style={btnPrimary} onClick={() => setScreen('import-choose')}>Import Existing Wallet</button>

          <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.2)', lineHeight: '1.6' }}>
            By continuing, you acknowledge that this is a self-custodial wallet. You are solely responsible for your seed phrase.
          </div>
        </div>
      </div>
    );
  }

  // ── SCREEN: Create — Education ────────────────────────────
  if (screen === 'create-edu') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '24px', background: 'var(--bg, #0a0a0f)' }}>
        <div style={baseCard}>
          <button onClick={() => setScreen('onboard')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '20px' }}>
            &larr; Back
          </button>
          <div style={{ fontSize: '18px', fontWeight: '800', marginBottom: '6px' }}>Before You Continue</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', lineHeight: '1.6', marginBottom: '24px' }}>
            You are about to see your 12-word seed phrase. This is the only way to recover your wallet.
          </div>

          {[
            ['Write it on paper', 'Never store it digitally or take a screenshot.'],
            ['Keep it offline', 'Never share it with anyone, including support staff.'],
            ['Store it safely', 'Anyone with these words can access your funds.'],
          ].map(([title, desc]) => (
            <div key={title} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.4)', marginTop: '6px', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: '700', fontSize: '13px', marginBottom: '2px' }}>{title}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: '1.5' }}>{desc}</div>
              </div>
            </div>
          ))}

          <label style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', cursor: 'pointer', marginBottom: '20px', marginTop: '8px' }}>
            <input type="checkbox" checked={hasAcknowledgedEdu} onChange={e => setHasAcknowledgedEdu(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'white' }} />
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.4' }}>
              I understand that losing my seed phrase means losing access to my wallet permanently.
            </span>
          </label>

          <button
            style={{ ...btnPrimary, opacity: hasAcknowledgedEdu ? 1 : 0.4, cursor: hasAcknowledgedEdu ? 'pointer' : 'not-allowed' }}
            disabled={!hasAcknowledgedEdu}
            onClick={() => setScreen('create-reveal')}
          >
            Show Seed Phrase
          </button>
        </div>
      </div>
    );
  }

  // ── SCREEN: Create — Reveal Seed Phrase ──────────────────
  if (screen === 'create-reveal') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '24px', background: 'var(--bg, #0a0a0f)' }}>
        <div style={baseCard}>
          <div style={{ fontSize: '18px', fontWeight: '800', marginBottom: '6px' }}>Your Seed Phrase</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px', lineHeight: '1.5' }}>
            Write these 12 words in order and store them somewhere safe.
          </div>

          {screenshotAttempted && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#f87171', marginBottom: '14px' }}>
              Screenshot blocked. Please write your seed phrase on paper.
            </div>
          )}

          {/* Word grid */}
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                filter: isSeedRevealed ? 'none' : 'blur(10px)',
                userSelect: isSeedRevealed ? 'text' : 'none',
                transition: 'filter 0.3s',
              }}
            >
              {words.map((word, i) => (
                <div
                  key={i}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px',
                    padding: '10px 8px',
                    textAlign: 'center',
                    fontSize: '13px',
                  }}
                >
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', display: 'block', marginBottom: '2px' }}>{i + 1}</span>
                  <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>{word}</span>
                </div>
              ))}
            </div>
            {!isSeedRevealed && (
              <div
                style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                onClick={() => setIsSeedRevealed(true)}
              >
                <div style={{ background: 'rgba(20,20,30,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '14px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', marginBottom: '6px' }}>&#128065;</div>
                  <div style={{ fontSize: '13px', fontWeight: '600' }}>Tap to reveal</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>Make sure no one is watching</div>
                </div>
              </div>
            )}
          </div>

          <button style={btnPrimary} disabled={!isSeedRevealed} onClick={startQuiz} style={{ ...btnPrimary, opacity: isSeedRevealed ? 1 : 0.4, cursor: isSeedRevealed ? 'pointer' : 'not-allowed' }}>
            I have written it down
          </button>
          <button style={btnSecondary} onClick={() => setScreen('create-edu')}>Back</button>
        </div>
      </div>
    );
  }

  // ── SCREEN: Create — Verify Quiz ─────────────────────────
  if (screen === 'create-verify') {
    const targetWord = generatedMnemonic.split(' ')[quizTargetIndex];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '24px', background: 'var(--bg, #0a0a0f)' }}>
        <div style={baseCard}>
          <div style={{ fontSize: '18px', fontWeight: '800', marginBottom: '6px' }}>Verify Your Phrase</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '24px', lineHeight: '1.5' }}>
            Step {quizStep} of 2 — Select word #{quizTargetIndex + 1} from your seed phrase.
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
            {quizWordPool.map(word => {
              let bg = 'rgba(255,255,255,0.05)';
              let borderColor = 'rgba(255,255,255,0.1)';
              if (quizSelectedWord === word) {
                if (quizStatus === 'correct') { bg = 'rgba(163,230,53,0.1)'; borderColor = 'rgba(163,230,53,0.4)'; }
                if (quizStatus === 'wrong') { bg = 'rgba(239,68,68,0.1)'; borderColor = 'rgba(239,68,68,0.4)'; }
              }
              return (
                <button
                  key={word}
                  onClick={() => handleQuizSelect(word)}
                  style={{
                    padding: '10px 18px',
                    background: bg,
                    border: `1px solid ${borderColor}`,
                    borderRadius: '10px',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    fontFamily: 'monospace',
                  }}
                >
                  {word}
                </button>
              );
            })}
          </div>

          <button style={{ ...btnSecondary, marginTop: '24px' }} onClick={() => setScreen('create-reveal')}>Back to phrase</button>
        </div>
      </div>
    );
  }

  // ── SCREEN: Import — Choose method ───────────────────────
  if (screen === 'import-choose') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '24px', background: 'var(--bg, #0a0a0f)' }}>
        <div style={baseCard}>
          <button onClick={() => setScreen('onboard')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '20px' }}>
            &larr; Back
          </button>
          <div style={{ fontSize: '18px', fontWeight: '800', marginBottom: '6px' }}>Import Wallet</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '24px', lineHeight: '1.5' }}>
            Choose how you want to restore access to your wallet.
          </div>

          <button style={btnPrimary} onClick={() => { setImportMode('mnemonic'); setScreen('import-mnemonic'); }}>
            Seed Phrase (12 or 24 words)
          </button>
          <button style={btnPrimary} onClick={() => { setImportMode('key'); setScreen('import-key'); }}>
            Private Key (base58)
          </button>
        </div>
      </div>
    );
  }

  // ── SCREEN: Import — Mnemonic ─────────────────────────────
  if (screen === 'import-mnemonic') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '24px', background: 'var(--bg, #0a0a0f)' }}>
        <div style={baseCard}>
          <button onClick={() => setScreen('import-choose')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '20px' }}>
            &larr; Back
          </button>
          <div style={{ fontSize: '18px', fontWeight: '800', marginBottom: '6px' }}>Enter Seed Phrase</div>

          {/* Word count toggle */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {[12, 24].map(n => (
              <button key={n} onClick={() => setWordCount(n)} style={{ padding: '6px 16px', background: wordCount === n ? 'rgba(255,255,255,0.12)' : 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', color: 'white', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                {n} words
              </button>
            ))}
          </div>

          {/* Input mode toggle */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {['paste', 'grid'].map(m => (
              <button key={m} onClick={() => setInputMode(m)} style={{ padding: '5px 14px', background: inputMode === m ? 'rgba(255,255,255,0.1)' : 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', color: inputMode === m ? 'white' : 'rgba(255,255,255,0.4)', fontSize: '12px', cursor: 'pointer' }}>
                {m === 'paste' ? 'Paste' : 'Word by word'}
              </button>
            ))}
          </div>

          {inputMode === 'paste' ? (
            <textarea
              value={mnemonicInput}
              onChange={e => setMnemonicInput(e.target.value)}
              placeholder="Paste your seed phrase here..."
              rows={4}
              style={{ ...inputStyle, resize: 'none', lineHeight: '1.6', marginBottom: '14px', fontFamily: 'monospace' }}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
              {importWords.map((w, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', top: '6px', left: '8px', fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>{i + 1}</span>
                  <input
                    type="text"
                    value={w}
                    onChange={e => { const arr = [...importWords]; arr[i] = e.target.value.trim().toLowerCase(); setImportWords(arr); }}
                    style={{ ...inputStyle, paddingTop: '20px', paddingBottom: '6px', fontSize: '12px', fontFamily: 'monospace' }}
                    autoComplete="off"
                    autoCapitalize="none"
                  />
                </div>
              ))}
            </div>
          )}

          {errorBox}

          <button style={btnPrimary} onClick={handleImportMnemonic} disabled={loading}>
            {loading ? 'Verifying...' : 'Import Wallet'}
          </button>
        </div>
      </div>
    );
  }

  // ── SCREEN: Import — Private Key ─────────────────────────
  if (screen === 'import-key') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '24px', background: 'var(--bg, #0a0a0f)' }}>
        <div style={baseCard}>
          <button onClick={() => setScreen('import-choose')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '20px' }}>
            &larr; Back
          </button>
          <div style={{ fontSize: '18px', fontWeight: '800', marginBottom: '6px' }}>Enter Private Key</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '16px', lineHeight: '1.5' }}>
            Enter your base58 encoded private key. It will be encrypted immediately.
          </div>

          <div style={{ position: 'relative', marginBottom: '14px' }}>
            <input
              type={isKeyHidden ? 'password' : 'text'}
              value={privateKeyInput}
              onChange={e => setPrivateKeyInput(e.target.value)}
              placeholder="Your private key..."
              style={{ ...inputStyle, fontFamily: 'monospace', paddingRight: '50px' }}
              autoComplete="off"
            />
            <button
              onClick={() => setIsKeyHidden(!isKeyHidden)}
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '12px' }}
            >
              {isKeyHidden ? 'Show' : 'Hide'}
            </button>
          </div>

          {errorBox}

          <button style={btnPrimary} onClick={handleImportPrivateKey} disabled={loading || !privateKeyInput.trim()}>
            {loading ? 'Verifying...' : 'Import Wallet'}
          </button>
        </div>
      </div>
    );
  }

  // ── SCREEN: Set PIN ───────────────────────────────────────
  if (screen === 'create-pin') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '24px', background: 'var(--bg, #0a0a0f)' }}>
        <div style={baseCard}>
          <div style={{ fontSize: '18px', fontWeight: '800', marginBottom: '6px' }}>Protect Your Wallet</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '24px', lineHeight: '1.5' }}>
            Set a PIN to encrypt your wallet locally. You will need this to unlock the app.
          </div>

          <label style={labelStyle}>Create PIN</label>
          <input
            type="password"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="Minimum 6 characters"
            style={{ ...inputStyle, marginBottom: '14px' }}
            autoComplete="new-password"
          />

          <label style={labelStyle}>Confirm PIN</label>
          <input
            type="password"
            value={pinConfirm}
            onChange={e => setPinConfirm(e.target.value)}
            placeholder="Repeat your PIN"
            style={{ ...inputStyle, marginBottom: '14px' }}
            autoComplete="new-password"
          />

          {pinError && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#f87171', marginBottom: '14px' }}>
              {pinError}
            </div>
          )}

          <button style={btnPrimary} onClick={handleSetPin} disabled={loading || !pin || !pinConfirm}>
            {loading ? 'Encrypting...' : 'Set PIN and Open Wallet'}
          </button>

          <div style={{ textAlign: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.2)', marginTop: '12px', lineHeight: '1.6' }}>
            Your PIN encrypts your keys locally using AES-256. We never see or store it.
          </div>
        </div>
      </div>
    );
  }

  return null;
}
