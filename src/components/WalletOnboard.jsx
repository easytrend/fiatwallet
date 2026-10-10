import { useState, useEffect, useRef } from 'react';
import buffer from 'buffer';
const Buffer = buffer.Buffer || buffer;
import * as bip39 from 'bip39';
import bs58 from 'bs58';
import { createNewWallet, importFromMnemonic, importFromPrivateKey } from '../services/walletCrypto';
import { encryptVault, saveVaultToStorage, saveWalletMeta } from '../services/walletVault';
import { initiateSession, verifySession, getEffectiveApiKey } from '../services/pajcashService';
import { saveSession } from '../services/supabase';
import logoImg from '../assets/logo.png';

export default function WalletOnboard({ onWalletReady, onConnectExternal, onContinueGuest, initialScreen = 'onboard', onClose }) {
  const [screen, setScreen] = useState(initialScreen);

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

  // PIN setup
  const [pendingSecretKey, setPendingSecretKey] = useState(null);
  const [pendingMnemonic, setPendingMnemonic] = useState('');
  const [pendingPublicKey, setPendingPublicKey] = useState('');
  const [pendingSource, setPendingSource] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');

  // General
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Tiny note popup: { text: string, type: 'info' }
  const [tinyNote, setTinyNote] = useState(null);
  const tinyNoteTimerRef = useRef(null);
  const [showGuestNote, setShowGuestNote] = useState(false);

  // Guest Mode Email Verification state
  const [guestAuthStep, setGuestAuthStep] = useState('intro'); // 'intro' | 'email' | 'otp' | 'verified'
  const [guestEmailInput, setGuestEmailInput] = useState(() => {
    try { return localStorage.getItem('paj_manual_sessionEmail') || ''; } catch { return ''; }
  });
  const [guestOtpInput, setGuestOtpInput] = useState('');
  const [guestAuthLoading, setGuestAuthLoading] = useState(false);
  const [guestAuthError, setGuestAuthError] = useState('');

  const handleOpenGuestModal = () => {
    const cachedEmail = localStorage.getItem('paj_manual_sessionEmail');
    const cachedToken = localStorage.getItem('paj_manual_sessionToken');
    const cachedExpiry = localStorage.getItem('paj_manual_sessionExpiry');
    if (cachedEmail && cachedToken && (!cachedExpiry || Date.now() < Number(cachedExpiry))) {
      setGuestEmailInput(cachedEmail);
      setGuestAuthStep('verified');
    } else {
      setGuestAuthStep('intro');
    }
    setGuestAuthError('');
    setShowGuestNote(true);
  };

  const handleInitiateGuestEmail = async () => {
    const cleanEmail = guestEmailInput.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setGuestAuthError('Please enter a valid email address.');
      return;
    }
    const apiKey = import.meta.env.VITE_PAJCASH_API_KEY || getEffectiveApiKey();
    if (!apiKey) {
      setGuestAuthError('PajCash service configuration missing.');
      return;
    }

    setGuestAuthLoading(true);
    setGuestAuthError('');
    try {
      await initiateSession(cleanEmail, apiKey);
      setGuestAuthStep('otp');
    } catch (err) {
      setGuestAuthError(err.message || 'Failed to send verification code. Please check your email.');
    } finally {
      setGuestAuthLoading(false);
    }
  };

  const handleVerifyGuestEmail = async () => {
    const cleanOtp = guestOtpInput.trim();
    if (!cleanOtp || cleanOtp.length !== 4) {
      setGuestAuthError('Please enter the 4-digit verification code.');
      return;
    }
    const apiKey = import.meta.env.VITE_PAJCASH_API_KEY || getEffectiveApiKey();
    if (!apiKey) {
      setGuestAuthError('PajCash service configuration missing.');
      return;
    }

    setGuestAuthLoading(true);
    setGuestAuthError('');
    try {
      const res = await verifySession(guestEmailInput.trim(), cleanOtp, apiKey);
      if (res?.token) {
        const token = res.token;
        const email = guestEmailInput.trim();
        const expiryMs = Date.now() + 30 * 24 * 60 * 60 * 1000;

        localStorage.setItem('paj_manual_sessionToken', token);
        localStorage.setItem('paj_manual_sessionEmail', email);
        localStorage.setItem('paj_manual_sessionExpiry', String(expiryMs));

        let guestWallet = localStorage.getItem('paj_manual_wallet');
        if (!guestWallet) {
          guestWallet = 'guest_' + Math.random().toString(36).slice(2, 12);
          localStorage.setItem('paj_manual_wallet', guestWallet);
        }

        saveSession(guestWallet, email, token, expiryMs);
        setShowGuestNote(false);
        if (onContinueGuest) onContinueGuest({ email, token, guestWallet });
      } else {
        setGuestAuthError('Verification succeeded but no session token was returned.');
      }
    } catch (err) {
      setGuestAuthError(err.message || 'Verification failed. Please check the 4-digit code.');
    } finally {
      setGuestAuthLoading(false);
    }
  };

  const showTinyNote = (text, type = 'info', autoCloseMs = 2000) => {
    if (tinyNoteTimerRef.current) clearTimeout(tinyNoteTimerRef.current);
    setTinyNote({ text, type });
    if (autoCloseMs > 0) {
      tinyNoteTimerRef.current = setTimeout(() => {
        setTinyNote(null);
      }, autoCloseMs);
    }
  };

  const closeTinyNote = () => {
    if (tinyNoteTimerRef.current) clearTimeout(tinyNoteTimerRef.current);
    setTinyNote(null);
  };

  // Screenshot protection on reveal screen
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

  useEffect(() => {
    setImportWords(Array(wordCount).fill(''));
    setMnemonicInput('');
  }, [wordCount]);

  // FLOW: CREATE WALLET
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

  useEffect(() => {
    if (initialScreen === 'create' || initialScreen === 'create-edu') {
      handleStartCreate();
    } else if (initialScreen === 'guest') {
      handleOpenGuestModal();
    }
  }, [initialScreen]);

  const startQuiz = () => {
    const words = generatedMnemonic.split(' ');
    const targetIdx = 2; // Word #3
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
          const nextIdx = 7; // Word #8
          setQuizTargetIndex(nextIdx);
          setQuizStep(2);
          const next = words[nextIdx];
          const wordlist = bip39.wordlists['english'];
          const nextPool = new Set([next]);
          while (nextPool.size < 6) nextPool.add(wordlist[Math.floor(Math.random() * wordlist.length)]);
          setQuizWordPool([...nextPool].sort(() => Math.random() - 0.5));
          setQuizSelectedWord(null);
          setQuizStatus('idle');
        }, 500);
      } else {
        setTimeout(() => setScreen('create-pin'), 500);
      }
    } else {
      setQuizStatus('wrong');
      setTimeout(() => { setQuizSelectedWord(null); setQuizStatus('idle'); }, 800);
    }
  };

  // FLOW: IMPORT WALLET
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

  // FLOW: PIN SETUP & SAVE
  const handleSetPin = async () => {
    setPinError('');
    if (pin.length < 6) { setPinError('PIN must be at least 6 characters.'); return; }
    if (pin !== pinConfirm) { setPinError('PINs do not match. Please try again.'); return; }
    setLoading(true);
    try {
      const secretMaterial = pendingMnemonic || bs58.encode(pendingSecretKey);
      const vault = await encryptVault(secretMaterial, pin);
      saveVaultToStorage(vault);
      saveWalletMeta(pendingPublicKey, pendingSource);
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

  // Theme Styles matching Fiatwallet
  const cardStyle = {
    position: 'relative',
    background: 'var(--card, #111e38)',
    border: '1px solid var(--border, rgba(255,255,255,0.09))',
    borderRadius: '24px',
    padding: '32px 26px',
    maxWidth: '420px',
    width: '100%',
    margin: '0 auto',
    color: 'var(--text, #f0f6ff)',
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45), 0 0 20px rgba(34, 211, 238, 0.05)',
    backdropFilter: 'blur(16px)',
    fontFamily: 'var(--ff, sans-serif)',
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
    marginBottom: '12px',
    transition: 'all 0.2s',
    letterSpacing: '0.01em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  };

  const btnSecondary = {
    width: '100%',
    padding: '13px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--border2, rgba(255,255,255,0.16))',
    borderRadius: '14px',
    color: 'var(--text, #f0f6ff)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    marginBottom: '10px',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  };

  const btnGhost = {
    background: 'none',
    border: 'none',
    color: 'var(--text2, rgba(240,246,255,0.55))',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    padding: '6px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'color 0.2s',
  };

  const inputStyle = {
    width: '100%',
    padding: '13px 15px',
    background: 'rgba(10, 22, 40, 0.75)',
    border: '1px solid var(--border, rgba(255,255,255,0.09))',
    borderRadius: '12px',
    color: 'var(--text, #f0f6ff)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'var(--ff, inherit)',
    transition: 'border-color 0.2s',
  };

  const labelStyle = {
    fontSize: '11px',
    color: 'var(--text2, rgba(240,246,255,0.55))',
    marginBottom: '6px',
    display: 'block',
    fontWeight: '600',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  };

  const errorBox = error ? (
    <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: 'var(--red, #f87171)', marginBottom: '14px', lineHeight: '1.5' }}>
      {error}
    </div>
  ) : null;

  const words = generatedMnemonic ? generatedMnemonic.split(' ') : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '85vh', padding: '24px 16px', position: 'relative', zIndex: 1 }}>
      {/* SCREEN: Onboard (landing) - Plane background matching native mobile theme */}
      {screen === 'onboard' && (
        <div style={{
          position: 'relative',
          width: '100%',
          maxWidth: '380px',
          margin: '0 auto',
          textAlign: 'center',
          fontFamily: 'var(--ff, sans-serif)',
          padding: '24px 8px',
        }}>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                background: 'none',
                border: 'none',
                color: 'var(--text2, rgba(240,246,255,0.6))',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '6px 10px',
              }}
            >
              ✕
            </button>
          )}

          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <img
              src={logoImg}
              alt="Fiatwallet"
              style={{ width: '72px', height: '72px', objectFit: 'contain', marginBottom: '14px' }}
            />
            <h1 style={{ fontSize: '26px', fontWeight: '800', letterSpacing: '-0.02em', margin: 0, color: 'white' }}>
              Fiatwallet
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text2, rgba(240,246,255,0.55))', marginTop: '6px', lineHeight: '1.5' }}>
              Simple, safe &amp; self-custodial
            </p>
          </div>

          {/* Tiny note popup for Coming Soon — no pop up card, no emoji */}
          {tinyNote && (
            <div
              style={{
                marginBottom: '16px',
                background: 'rgba(15, 23, 42, 0.96)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                borderRadius: '12px',
                padding: '10px 14px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                animation: 'fadeIn 0.15s ease-out',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <span style={{ fontSize: '13px', color: '#f0f6ff', fontWeight: '500', lineHeight: 1.4 }}>
                {tinyNote.text}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              style={{
                width: '100%',
                padding: '16px 20px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '16px',
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontFamily: 'var(--ff)',
                textAlign: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              }}
              onClick={onConnectExternal}
            >
              Connect wallet
            </button>

            <button
              style={{
                width: '100%',
                padding: '16px 20px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '16px',
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                fontFamily: 'var(--ff)',
                textAlign: 'center',
                opacity: loading ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                }
              }}
              onClick={handleStartCreate}
              disabled={loading}
            >
              {loading && screen === 'onboard' ? 'Creating...' : 'Create wallet'}
            </button>

            <button
              style={{
                width: '100%',
                padding: '16px 20px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '16px',
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontFamily: 'var(--ff)',
                textAlign: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              }}
              onClick={() => setScreen('import-choose')}
            >
              Import existing wallet
            </button>

            <button
              style={{
                width: '100%',
                padding: '16px 20px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '16px',
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontFamily: 'var(--ff)',
                textAlign: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              }}
              onClick={handleOpenGuestModal}
            >
              Guest mode
            </button>
          </div>

          {/* Guest Mode Pop Up Modal with 4-Digit Email Verification */}
          {showGuestNote && (
            <div
              style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '20px',
                animation: 'fadeIn 0.2s ease',
              }}
              onClick={() => setShowGuestNote(false)}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'linear-gradient(160deg, rgba(22,22,22,0.98) 0%, rgba(12,12,12,0.99) 100%)',
                  border: '1px solid rgba(163,230,53,0.25)',
                  borderRadius: '20px',
                  padding: '26px 22px',
                  maxWidth: '380px',
                  width: '100%',
                  boxShadow: '0 0 40px rgba(163,230,53,0.12), 0 20px 60px rgba(0,0,0,0.6)',
                  textAlign: 'left',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '50%',
                    background: 'rgba(163,230,53,0.12)',
                    border: '1px solid rgba(163,230,53,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#a3e635', fontSize: '20px', fontWeight: '900', lineHeight: 1, flexShrink: 0,
                  }}>•</div>
                  <div>
                    <div style={{ color: '#a3e635', fontWeight: '800', fontSize: '15px' }}>Guest Mode</div>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px', marginTop: '1px' }}>
                      {guestAuthStep === 'otp' ? 'Enter 4-digit verification code' : guestAuthStep === 'email' ? 'Email verification required' : guestAuthStep === 'verified' ? 'Verified session active' : 'No wallet connection required'}
                    </div>
                  </div>
                </div>

                {guestAuthStep === 'intro' && (
                  <>
                    {/* Free features */}
                    <div style={{
                      background: 'rgba(163,230,53,0.05)',
                      border: '1px solid rgba(163,230,53,0.15)',
                      borderRadius: '12px', padding: '14px', marginBottom: '14px',
                    }}>
                      <div style={{ color: '#a3e635', fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '900', lineHeight: 1 }}>•</span>
                        <span>Available without wallet</span>
                      </div>
                      {[
                        ['Offramp', 'Convert crypto to cash — no wallet connect needed'],
                        ['Onramp', 'Receive crypto straight to any Solana address'],
                      ].map(([title, desc]) => (
                        <div key={title} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <span style={{ color: '#a3e635', fontSize: '16px', fontWeight: '900', lineHeight: '14px', flexShrink: 0, marginTop: '2px' }}>•</span>
                          <div>
                            <div style={{ color: 'white', fontWeight: '700', fontSize: '12px' }}>{title}</div>
                            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px', lineHeight: '1.4' }}>{desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Wallet-required features */}
                    <div style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '12px', padding: '14px', marginBottom: '20px',
                    }}>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '900', lineHeight: 1 }}>•</span>
                        <span>Requires wallet connection</span>
                      </div>
                      {[
                        ['Recovered SOL', 'Reclaim dust & rent-exempt SOL'],
                        ['Claim CashBack', 'Claim cashback earn from pumpfun'],
                        ['Swap', 'Instant token swaps on-chain'],
                        ['Bulk / Single Send', 'Send tokens to multiple wallets'],
                        ['Future Integrations', 'More DeFi tools coming soon'],
                      ].map(([title, desc]) => (
                        <div key={title} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '16px', fontWeight: '900', lineHeight: '14px', flexShrink: 0, marginTop: '2px' }}>•</span>
                          <div>
                            <div style={{ color: 'rgba(255,255,255,0.75)', fontWeight: '600', fontSize: '12px' }}>{title}</div>
                            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', lineHeight: '1.4' }}>{desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => {
                        setGuestAuthError('');
                        setGuestAuthStep('email');
                      }}
                      style={{
                        width: '100%', background: '#a3e635',
                        border: 'none', borderRadius: '12px',
                        color: '#000', fontWeight: '800', fontSize: '13px',
                        padding: '13px', cursor: 'pointer',
                        transition: 'opacity 0.2s',
                        textAlign: 'center',
                        fontFamily: 'var(--ff)',
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      Continue to Email Verification
                    </button>
                    <button
                      onClick={() => setShowGuestNote(false)}
                      style={{
                        width: '100%', background: 'transparent', border: 'none',
                        color: 'rgba(255,255,255,0.35)', fontSize: '11px',
                        padding: '10px', cursor: 'pointer', marginTop: '6px',
                        textAlign: 'center', fontFamily: 'var(--ff)',
                      }}
                    >
                      Dismiss
                    </button>
                  </>
                )}

                {guestAuthStep === 'email' && (
                  <>
                    <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '12px', lineHeight: '1.4', marginBottom: '14px' }}>
                      Enter your email to receive a 4-digit verification code.
                    </div>

                    <div style={{ marginBottom: '14px' }}>
                      <input
                        type="email"
                        value={guestEmailInput}
                        onChange={(e) => setGuestEmailInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleInitiateGuestEmail(); }}
                        placeholder="you@example.com"
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(163,230,53,0.3)',
                          borderRadius: '12px', padding: '12px 14px',
                          color: '#fff', fontSize: '14px', outline: 'none',
                          fontFamily: 'var(--ff)',
                        }}
                        autoFocus
                      />
                    </div>

                    {guestAuthError && (
                      <div style={{
                        background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
                        borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#f87171',
                        marginBottom: '14px', lineHeight: '1.4'
                      }}>
                        ✕ {guestAuthError}
                      </div>
                    )}

                    <button
                      onClick={handleInitiateGuestEmail}
                      disabled={guestAuthLoading || !guestEmailInput.trim()}
                      style={{
                        width: '100%', background: '#a3e635',
                        border: 'none', borderRadius: '12px',
                        color: '#000', fontWeight: '800', fontSize: '13px',
                        padding: '13px', cursor: guestAuthLoading || !guestEmailInput.trim() ? 'not-allowed' : 'pointer',
                        opacity: guestAuthLoading || !guestEmailInput.trim() ? 0.6 : 1,
                        transition: 'opacity 0.2s',
                        textAlign: 'center', fontFamily: 'var(--ff)',
                      }}
                    >
                      {guestAuthLoading ? 'Sending code...' : 'Send Verification Code'}
                    </button>

                    <button
                      onClick={() => { setGuestAuthError(''); setGuestAuthStep('intro'); }}
                      style={{
                        width: '100%', background: 'transparent', border: 'none',
                        color: 'rgba(255,255,255,0.35)', fontSize: '11px',
                        padding: '10px', cursor: 'pointer', marginTop: '6px',
                        textAlign: 'center', fontFamily: 'var(--ff)',
                      }}
                    >
                      Back
                    </button>
                  </>
                )}

                {guestAuthStep === 'otp' && (
                  <>
                    <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '12px', lineHeight: '1.4', marginBottom: '14px' }}>
                      Enter the 4-digit code sent to <span style={{ color: '#fff', fontWeight: '600' }}>{guestEmailInput}</span>
                    </div>

                    <div style={{ marginBottom: '14px' }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={guestOtpInput}
                        onChange={(e) => setGuestOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyGuestEmail(); }}
                        placeholder="0000"
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(163,230,53,0.3)',
                          borderRadius: '12px', padding: '12px 14px',
                          color: '#fff', fontSize: '22px', letterSpacing: '0.4em',
                          textAlign: 'center', outline: 'none',
                          fontFamily: 'var(--mono, monospace)',
                        }}
                        autoFocus
                      />
                    </div>

                    {guestAuthError && (
                      <div style={{
                        background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
                        borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#f87171',
                        marginBottom: '14px', lineHeight: '1.4'
                      }}>
                        ✕ {guestAuthError}
                      </div>
                    )}

                    <button
                      onClick={handleVerifyGuestEmail}
                      disabled={guestAuthLoading || guestOtpInput.trim().length !== 4}
                      style={{
                        width: '100%', background: '#a3e635',
                        border: 'none', borderRadius: '12px',
                        color: '#000', fontWeight: '800', fontSize: '13px',
                        padding: '13px', cursor: guestAuthLoading || guestOtpInput.trim().length !== 4 ? 'not-allowed' : 'pointer',
                        opacity: guestAuthLoading || guestOtpInput.trim().length !== 4 ? 0.6 : 1,
                        transition: 'opacity 0.2s',
                        textAlign: 'center', fontFamily: 'var(--ff)',
                      }}
                    >
                      {guestAuthLoading ? 'Verifying...' : 'Verify & Enter Guest Mode'}
                    </button>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                      <button
                        onClick={handleInitiateGuestEmail}
                        disabled={guestAuthLoading}
                        style={{
                          background: 'transparent', border: 'none',
                          color: '#a3e635', fontSize: '11px',
                          padding: '6px', cursor: 'pointer', fontFamily: 'var(--ff)',
                        }}
                      >
                        Resend code
                      </button>
                      <button
                        onClick={() => { setGuestAuthError(''); setGuestAuthStep('email'); }}
                        style={{
                          background: 'transparent', border: 'none',
                          color: 'rgba(255,255,255,0.4)', fontSize: '11px',
                          padding: '6px', cursor: 'pointer', fontFamily: 'var(--ff)',
                        }}
                      >
                        Change email
                      </button>
                    </div>
                  </>
                )}

                {guestAuthStep === 'verified' && (
                  <>
                    <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '12px', lineHeight: '1.4', marginBottom: '14px' }}>
                      Your email is verified for Guest Mode on this device.
                    </div>

                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      background: 'rgba(163,230,53,0.08)', border: '1px solid rgba(163,230,53,0.3)',
                      borderRadius: '12px', padding: '10px 14px', marginBottom: '18px',
                    }}>
                      <span style={{ color: '#a3e635', fontWeight: 'bold' }}>✓</span>
                      <span style={{ color: '#fff', fontSize: '13px', fontWeight: '600', wordBreak: 'break-all' }}>{guestEmailInput}</span>
                    </div>

                    <button
                      onClick={() => {
                        setShowGuestNote(false);
                        const token = localStorage.getItem('paj_manual_sessionToken');
                        const email = guestEmailInput || localStorage.getItem('paj_manual_sessionEmail');
                        const guestWallet = localStorage.getItem('paj_manual_wallet');
                        if (onContinueGuest) onContinueGuest({ email, token, guestWallet });
                      }}
                      style={{
                        width: '100%', background: '#a3e635',
                        border: 'none', borderRadius: '12px',
                        color: '#000', fontWeight: '800', fontSize: '13px',
                        padding: '13px', cursor: 'pointer',
                        transition: 'opacity 0.2s',
                        textAlign: 'center', fontFamily: 'var(--ff)',
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      Enter Guest Mode
                    </button>

                    <button
                      onClick={() => {
                        localStorage.removeItem('paj_manual_sessionToken');
                        localStorage.removeItem('paj_manual_sessionEmail');
                        localStorage.removeItem('paj_manual_sessionExpiry');
                        setGuestEmailInput('');
                        setGuestOtpInput('');
                        setGuestAuthStep('email');
                      }}
                      style={{
                        width: '100%', background: 'transparent', border: 'none',
                        color: 'rgba(255,255,255,0.4)', fontSize: '11px',
                        padding: '10px', cursor: 'pointer', marginTop: '6px',
                        textAlign: 'center', fontFamily: 'var(--ff)',
                      }}
                    >
                      Use a different email
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '11px', color: 'var(--text3, rgba(240,246,255,0.28))', lineHeight: '1.5' }}>
            Non-custodial: Your private keys never leave your device.
          </div>
        </div>
      )}

      {/* SCREEN: Create — Education */}
      {screen === 'create-edu' && (
        <div style={cardStyle}>
          <button onClick={() => setScreen('onboard')} style={btnGhost}>
            ← Back
          </button>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginTop: '12px', marginBottom: '6px', color: 'white' }}>
            Secure Your Secret Phrase
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: '1.6', marginBottom: '22px' }}>
            You will receive a 12-word seed phrase. It is the master key to your funds.
          </p>

          {[
            ['Write it down physically', 'Save it on paper or a metal card. Do not save it in cloud notes.'],
            ['Never share your phrase', 'Anyone with your phrase has complete control over your wallet.'],
            ['Self-custody principle', 'Fiatwallet cannot recover your account if you lose this phrase.'],
          ].map(([title, desc]) => (
            <div key={title} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '16px', background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--lime)', marginTop: '7px', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: '700', fontSize: '13px', color: 'white' }}>{title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px', lineHeight: '1.4' }}>{desc}</div>
              </div>
            </div>
          ))}

          <label style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '12px 14px', background: 'rgba(163,230,53,0.05)', border: '1px solid rgba(163,230,53,0.2)', borderRadius: '12px', cursor: 'pointer', margin: '18px 0' }}>
            <input
              type="checkbox"
              checked={hasAcknowledgedEdu}
              onChange={e => setHasAcknowledgedEdu(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: 'var(--lime)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '12px', color: 'var(--text)', lineHeight: '1.4' }}>
              I understand that losing my seed phrase means losing my funds permanently.
            </span>
          </label>

          <button
            style={{ ...btnPrimary, opacity: hasAcknowledgedEdu ? 1 : 0.4, cursor: hasAcknowledgedEdu ? 'pointer' : 'not-allowed' }}
            disabled={!hasAcknowledgedEdu}
            onClick={() => setScreen('create-reveal')}
          >
            Reveal Seed Phrase
          </button>
        </div>
      )}

      {/* SCREEN: Create — Reveal Seed Phrase */}
      {screen === 'create-reveal' && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '6px', color: 'white' }}>Your 12-Word Phrase</h2>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '18px', lineHeight: '1.5' }}>
            Write down these words in exact order.
          </p>

          {screenshotAttempted && (
            <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: 'var(--red)', marginBottom: '14px' }}>
              Screenshot blocked. Please write the seed phrase manually.
            </div>
          )}

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
                    background: 'var(--card2, #0f1c32)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '10px 8px',
                    textAlign: 'center',
                    fontSize: '13px',
                  }}
                >
                  <span style={{ fontSize: '10px', color: 'var(--text3)', display: 'block', marginBottom: '2px' }}>{i + 1}</span>
                  <span style={{ fontWeight: '700', fontFamily: 'var(--mono, monospace)', color: 'white' }}>{word}</span>
                </div>
              ))}
            </div>

            {!isSeedRevealed && (
              <div
                style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                onClick={() => setIsSeedRevealed(true)}
              >
                <div style={{ background: 'rgba(10,22,40,0.92)', border: '1px solid rgba(163,230,53,0.3)', borderRadius: '14px', padding: '16px 24px', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--lime)' }}>Tap to reveal</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px' }}>Make sure no one is looking</div>
                </div>
              </div>
            )}
          </div>

          <button
            style={{ ...btnPrimary, opacity: isSeedRevealed ? 1 : 0.4, cursor: isSeedRevealed ? 'pointer' : 'not-allowed' }}
            disabled={!isSeedRevealed}
            onClick={startQuiz}
          >
            I have saved my phrase
          </button>
          <button style={btnSecondary} onClick={() => setScreen('create-edu')}>Back</button>
        </div>
      )}

      {/* SCREEN: Create — Verify Quiz */}
      {screen === 'create-verify' && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '6px', color: 'white' }}>Confirm Phrase</h2>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '22px', lineHeight: '1.5' }}>
            Step {quizStep} of 2: Which word is <b>#{quizTargetIndex + 1}</b>?
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {quizWordPool.map(word => {
              let bg = 'rgba(255,255,255,0.04)';
              let border = '1px solid var(--border)';
              let color = 'white';
              if (quizSelectedWord === word) {
                if (quizStatus === 'correct') { bg = 'rgba(163,230,53,0.15)'; border = '1px solid var(--lime)'; color = 'var(--lime)'; }
                if (quizStatus === 'wrong') { bg = 'rgba(248,113,113,0.15)'; border = '1px solid var(--red)'; color = 'var(--red)'; }
              }
              return (
                <button
                  key={word}
                  onClick={() => handleQuizSelect(word)}
                  style={{
                    padding: '12px 14px',
                    background: bg,
                    border,
                    borderRadius: '12px',
                    color,
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    fontFamily: 'var(--mono, monospace)',
                  }}
                >
                  {word}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: '24px' }}>
            <button style={btnSecondary} onClick={() => setScreen('create-reveal')}>Back to phrase</button>
          </div>
        </div>
      )}

      {/* SCREEN: Import — Choose Method */}
      {screen === 'import-choose' && (
        <div style={cardStyle}>
          <button onClick={() => setScreen('onboard')} style={btnGhost}>
            ← Back
          </button>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginTop: '12px', marginBottom: '6px', color: 'white' }}>Import Wallet</h2>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '22px', lineHeight: '1.5' }}>
            Choose how you would like to restore your Solana wallet.
          </p>

          <button style={btnPrimary} onClick={() => { setImportMode('mnemonic'); setScreen('import-mnemonic'); }}>
            Seed Phrase (12 or 24 words)
          </button>
          <button style={btnSecondary} onClick={() => { setImportMode('key'); setScreen('import-key'); }}>
            Private Key (Base58)
          </button>
        </div>
      )}

      {/* SCREEN: Import — Mnemonic */}
      {screen === 'import-mnemonic' && (
        <div style={cardStyle}>
          <button onClick={() => setScreen('import-choose')} style={btnGhost}>
            ← Back
          </button>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginTop: '12px', marginBottom: '12px', color: 'white' }}>Enter Seed Phrase</h2>

          {/* Word count toggle */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            {[12, 24].map(n => (
              <button
                key={n}
                onClick={() => setWordCount(n)}
                style={{
                  padding: '6px 16px',
                  background: wordCount === n ? 'rgba(163,230,53,0.15)' : 'rgba(255,255,255,0.04)',
                  border: wordCount === n ? '1px solid var(--lime)' : '1px solid var(--border)',
                  borderRadius: '20px',
                  color: wordCount === n ? 'var(--lime)' : 'var(--text2)',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                {n} words
              </button>
            ))}
          </div>

          {/* Input mode toggle */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            {['paste', 'grid'].map(m => (
              <button
                key={m}
                onClick={() => setInputMode(m)}
                style={{
                  padding: '5px 14px',
                  background: inputMode === m ? 'rgba(255,255,255,0.1)' : 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '20px',
                  color: inputMode === m ? 'white' : 'var(--text2)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {m === 'paste' ? 'Paste all' : 'Word by word'}
              </button>
            ))}
          </div>

          {inputMode === 'paste' ? (
            <textarea
              value={mnemonicInput}
              onChange={e => setMnemonicInput(e.target.value)}
              placeholder="Paste your 12 or 24 words separated by space..."
              rows={4}
              style={{ ...inputStyle, resize: 'none', lineHeight: '1.6', marginBottom: '14px', fontFamily: 'var(--mono, monospace)' }}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
              {importWords.map((w, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', top: '5px', left: '7px', fontSize: '9px', color: 'var(--text3)' }}>{i + 1}</span>
                  <input
                    type="text"
                    value={w}
                    onChange={e => { const arr = [...importWords]; arr[i] = e.target.value.trim().toLowerCase(); setImportWords(arr); }}
                    style={{ ...inputStyle, paddingTop: '18px', paddingBottom: '6px', fontSize: '12px', fontFamily: 'var(--mono, monospace)' }}
                    autoComplete="off"
                    autoCapitalize="none"
                  />
                </div>
              ))}
            </div>
          )}

          {errorBox}

          <button style={btnPrimary} onClick={handleImportMnemonic} disabled={loading}>
            {loading ? 'Verifying...' : 'Restore Wallet'}
          </button>
        </div>
      )}

      {/* SCREEN: Import — Private Key */}
      {screen === 'import-key' && (
        <div style={cardStyle}>
          <button onClick={() => setScreen('import-choose')} style={btnGhost}>
            ← Back
          </button>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginTop: '12px', marginBottom: '6px', color: 'white' }}>Enter Private Key</h2>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px', lineHeight: '1.5' }}>
            Paste your Base58 encoded secret key.
          </p>

          <div style={{ position: 'relative', marginBottom: '14px' }}>
            <input
              type={isKeyHidden ? 'password' : 'text'}
              value={privateKeyInput}
              onChange={e => setPrivateKeyInput(e.target.value)}
              placeholder="Base58 private key..."
              style={{ ...inputStyle, fontFamily: 'var(--mono, monospace)', paddingRight: '54px' }}
              autoComplete="off"
            />
            <button
              onClick={() => setIsKeyHidden(!isKeyHidden)}
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}
            >
              {isKeyHidden ? 'Show' : 'Hide'}
            </button>
          </div>

          {errorBox}

          <button style={btnPrimary} onClick={handleImportPrivateKey} disabled={loading || !privateKeyInput.trim()}>
            {loading ? 'Verifying...' : 'Restore Wallet'}
          </button>
        </div>
      )}

      {/* SCREEN: Set PIN */}
      {screen === 'create-pin' && (
        <div style={cardStyle}>
          <button
            onClick={() => {
              if (pendingSource === 'created') setScreen('create-reveal');
              else if (pendingSource === 'imported-mnemonic') setScreen('import-mnemonic');
              else if (pendingSource === 'imported-privatekey') setScreen('import-key');
              else setScreen('onboard');
            }}
            style={btnGhost}
          >
            ← Back
          </button>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginTop: '12px', marginBottom: '6px', color: 'white' }}>Set Local PIN</h2>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '22px', lineHeight: '1.5' }}>
            This PIN encrypts your keys locally on this device using AES-256.
          </p>

          <label style={labelStyle}>Create PIN (Min 6 digits/characters)</label>
          <input
            type="password"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="••••••"
            style={{ ...inputStyle, marginBottom: '14px', letterSpacing: '0.2em' }}
            autoComplete="new-password"
          />

          <label style={labelStyle}>Confirm PIN</label>
          <input
            type="password"
            value={pinConfirm}
            onChange={e => setPinConfirm(e.target.value)}
            placeholder="••••••"
            style={{ ...inputStyle, marginBottom: '16px', letterSpacing: '0.2em' }}
            autoComplete="new-password"
          />

          {pinError && (
            <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: 'var(--red)', marginBottom: '14px' }}>
              {pinError}
            </div>
          )}

          <button style={btnPrimary} onClick={handleSetPin} disabled={loading || !pin || !pinConfirm}>
            {loading ? 'Securing Wallet...' : 'Save & Open Wallet'}
          </button>
        </div>
      )}
    </div>
  );
}
