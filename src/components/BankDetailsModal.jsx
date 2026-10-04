import { useState, useEffect, useMemo, useRef } from 'react';
import { getBanks, resolveBankAccount, initiateSession, verifySession } from '../services/pajcashService';
import { getFiatTagByWallet, registerFiatTag, loadSession, saveSession } from '../services/supabase';

const PAJCASH_API_KEY = import.meta.env.VITE_PAJCASH_API_KEY;

export default function BankDetailsModal({ walletAddress, onClose, onTagSaved }) {
  const [tagName, setTagName] = useState('');
  const [banks, setBanks] = useState([]);
  const [bankSearch, setBankSearch] = useState('');
  const [selectedBankId, setSelectedBankId] = useState('');
  const [selectedBankCode, setSelectedBankCode] = useState('');
  const [selectedBankName, setSelectedBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // PajCash session state
  const [sessionToken, setSessionToken] = useState('');
  const [sessionEmail, setSessionEmail] = useState('');
  const [sessionLoading, setSessionLoading] = useState(true);

  // Inline email OTP state (fallback if user has no session yet)
  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [authStep, setAuthStep] = useState('email'); // 'email' | 'otp'
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const resolveTimerRef = useRef(null);

  // 1. Resolve active PajCash session on mount
  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      setSessionLoading(true);
      try {
        // ① Check localStorage for this specific wallet
        if (walletAddress) {
          const cachedToken = localStorage.getItem(`paj_sessionToken_${walletAddress}`);
          const cachedExpiry = localStorage.getItem(`paj_sessionExpiry_${walletAddress}`);
          const cachedEmail = localStorage.getItem(`paj_sessionEmail_${walletAddress}`);

          if (cachedToken && (!cachedExpiry || Date.now() < Number(cachedExpiry))) {
            if (isMounted) {
              setSessionToken(cachedToken);
              setSessionEmail(cachedEmail || '');
              setSessionLoading(false);
            }
            return;
          }

          // ② Check Supabase paj_sessions for this wallet
          try {
            const row = await loadSession(walletAddress);
            if (row?.session_token && isMounted) {
              const expiryMs = row.expires_at
                ? new Date(row.expires_at).getTime()
                : Date.now() + 20 * 365 * 24 * 60 * 60 * 1000;

              setSessionToken(row.session_token);
              setSessionEmail(row.email || '');
              setSessionLoading(false);

              localStorage.setItem(`paj_sessionToken_${walletAddress}`, row.session_token);
              if (row.email) localStorage.setItem(`paj_sessionEmail_${walletAddress}`, row.email);
              localStorage.setItem(`paj_sessionExpiry_${walletAddress}`, String(expiryMs));
              return;
            }
          } catch (supErr) {
            console.warn('[BankDetailsModal] Supabase session check error:', supErr);
          }
        }

        // ③ Check manual / guest session
        const manualToken = localStorage.getItem('paj_manual_sessionToken');
        const manualExpiry = localStorage.getItem('paj_manual_sessionExpiry');
        const manualEmail = localStorage.getItem('paj_manual_sessionEmail');

        if (manualToken && (!manualExpiry || Date.now() < Number(manualExpiry))) {
          if (isMounted) {
            setSessionToken(manualToken);
            setSessionEmail(manualEmail || '');
            setSessionLoading(false);
          }
          return;
        }

        // ④ Check any active paj_sessionToken_ in localStorage
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('paj_sessionToken_')) {
            const tok = localStorage.getItem(k);
            if (tok) {
              if (isMounted) {
                setSessionToken(tok);
                setSessionLoading(false);
              }
              return;
            }
          }
        }

        if (isMounted) setSessionLoading(false);
      } catch (err) {
        console.warn('[BankDetailsModal] Session check error:', err);
        if (isMounted) setSessionLoading(false);
      }
    }

    checkSession();
    return () => { isMounted = false; };
  }, [walletAddress]);

  // 2. Load existing tag if any
  useEffect(() => {
    if (!walletAddress) return;
    getFiatTagByWallet(walletAddress)
      .then(tag => {
        if (tag) {
          setTagName(tag.tag_name ? tag.tag_name.replace('$', '') : '');
          setSelectedBankName(tag.bank_name || '');
          setSelectedBankCode(tag.bank_code || '');
          setSelectedBankId(tag.bank_id || tag.bank_code || '');
          setAccountNumber(tag.account_number || '');
          setAccountName(tag.account_name || '');
        }
      })
      .catch(err => console.warn('[BankDetailsModal] Error loading tag:', err));
  }, [walletAddress]);

  // 3. Fetch supported banks from PajCash API
  useEffect(() => {
    let isMounted = true;
    const fetchBanks = async () => {
      try {
        const res = await getBanks(sessionToken || PAJCASH_API_KEY || undefined);
        const list = Array.isArray(res) ? res : (res?.data || []);
        if (list.length > 0 && isMounted) {
          setBanks(list);
          return;
        }
      } catch (sdkErr) {
        console.warn('[BankDetailsModal] sdkGetBanks error, trying direct public endpoint:', sdkErr);
      }

      // Public endpoint fallback
      try {
        const resp = await fetch('https://api.paj.cash/pub/bank');
        if (resp.ok) {
          const data = await resp.json();
          const list = Array.isArray(data) ? data : (data?.data || []);
          if (list.length > 0 && isMounted) {
            setBanks(list);
          }
        }
      } catch (pubErr) {
        console.warn('[BankDetailsModal] Public bank fetch error:', pubErr);
      }
    };

    fetchBanks();
    return () => { isMounted = false; };
  }, [sessionToken]);

  // 4. Synchronize selectedBankId if bank_name or bank_code was preloaded
  useEffect(() => {
    if (!banks.length) return;
    if (!selectedBankId && (selectedBankCode || selectedBankName)) {
      const match = banks.find(b =>
        (selectedBankCode && (b.id === selectedBankCode || b.code === selectedBankCode)) ||
        (selectedBankName && (b.name || '').toLowerCase() === selectedBankName.toLowerCase())
      );
      if (match) {
        setSelectedBankId(match.id || match.code);
        if (!selectedBankCode) setSelectedBankCode(match.code || match.bank_code || '');
        if (!selectedBankName) setSelectedBankName(match.name || match.bank_name || '');
      }
    }
  }, [banks, selectedBankCode, selectedBankName, selectedBankId]);

  // 5. Auto-resolve bank account name when 10 digits and bank selected
  useEffect(() => {
    if (resolveTimerRef.current) {
      clearTimeout(resolveTimerRef.current);
    }

    const cleanNum = accountNumber.trim().replace(/\D/g, '');

    if (cleanNum.length === 10 && selectedBankId) {
      if (sessionLoading) return; // Wait until session token resolution finishes

      if (!sessionToken) {
        setAccountName('');
        setError('PajCash verification required. Please enter your email below to verify.');
        return;
      }

      setResolving(true);
      setError('');

      resolveTimerRef.current = setTimeout(() => {
        resolveBankAccount(sessionToken, selectedBankId, cleanNum)
          .then(res => {
            const resolvedName =
              res?.accountName ||
              res?.account_name ||
              res?.name ||
              res?.data?.account_name ||
              res?.data?.accountName ||
              '';

            if (resolvedName) {
              setAccountName(resolvedName);
              setError('');
            } else {
              setAccountName('');
              setError('Could not verify account name. Please check your bank and account number.');
            }
          })
          .catch(err => {
            setAccountName('');
            const msg = err?.message || String(err);
            setError(msg);

            // Handle session invalidation
            if (
              msg.toLowerCase().includes('session') ||
              msg.toLowerCase().includes('expired') ||
              msg.toLowerCase().includes('unauthorized') ||
              msg.toLowerCase().includes('invalid token')
            ) {
              setSessionToken('');
              if (walletAddress) {
                localStorage.removeItem(`paj_sessionToken_${walletAddress}`);
                localStorage.removeItem(`paj_sessionExpiry_${walletAddress}`);
              }
            }
          })
          .finally(() => setResolving(false));
      }, 350);

      return () => {
        if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
      };
    } else {
      if (cleanNum.length !== 10) {
        setAccountName('');
      }
    }
  }, [accountNumber, selectedBankId, sessionToken, sessionLoading, walletAddress]);

  // 6. Handle inline email OTP session initiation
  const handleInitiateEmail = async (e) => {
    if (e) e.preventDefault();
    if (!emailInput.trim()) {
      setAuthError('Please enter your email.');
      return;
    }
    const apiKey = PAJCASH_API_KEY;
    if (!apiKey) {
      setAuthError('PajCash API key is not configured.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');
    try {
      await initiateSession(emailInput.trim(), apiKey);
      setAuthStep('otp');
    } catch (err) {
      setAuthError(err.message || 'Failed to send OTP code.');
    } finally {
      setAuthLoading(false);
    }
  };

  // 7. Handle inline email OTP verification
  const handleVerifyEmail = async (e) => {
    if (e) e.preventDefault();
    if (!otpInput.trim()) {
      setAuthError('Please enter the 6-digit OTP code.');
      return;
    }
    const apiKey = PAJCASH_API_KEY;
    if (!apiKey) {
      setAuthError('PajCash API key is not configured.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await verifySession(emailInput.trim(), otpInput.trim(), apiKey);
      if (res?.token) {
        setSessionToken(res.token);
        setSessionEmail(emailInput.trim());
        setError('');
        setAuthError('');

        const expiryMs = Date.now() + 20 * 365 * 24 * 60 * 60 * 1000;
        if (walletAddress) {
          localStorage.setItem(`paj_sessionToken_${walletAddress}`, res.token);
          localStorage.setItem(`paj_sessionEmail_${walletAddress}`, emailInput.trim());
          localStorage.setItem(`paj_sessionExpiry_${walletAddress}`, String(expiryMs));
          saveSession(walletAddress, emailInput.trim(), res.token, expiryMs);
        } else {
          localStorage.setItem('paj_manual_sessionToken', res.token);
          localStorage.setItem('paj_manual_sessionEmail', emailInput.trim());
        }
      } else {
        setAuthError('Verification succeeded but no session token was returned.');
      }
    } catch (err) {
      setAuthError(err.message || 'Verification failed. Please check the code.');
    } finally {
      setAuthLoading(false);
    }
  };

  // 8. Handle save Fiat Tag
  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const cleanTag = tagName.trim().replace(/^@/, '').replace(/^\$/, '');
    if (!cleanTag || cleanTag.length < 3) {
      setError('Fiat Tag must be at least 3 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanTag)) {
      setError('Fiat Tag can only contain letters, numbers, and underscores.');
      return;
    }
    if (!selectedBankName || !selectedBankId) {
      setError('Please select your bank.');
      return;
    }
    const cleanNum = accountNumber.trim().replace(/\D/g, '');
    if (cleanNum.length !== 10) {
      setError('Please enter a valid 10-digit Nigerian account number.');
      return;
    }
    if (!accountName.trim()) {
      setError('Account name could not be verified. Please ensure the bank and account number are correct.');
      return;
    }

    setSaving(true);
    try {
      const saved = await registerFiatTag({
        walletAddress,
        tagName: `$${cleanTag}`,
        bankName: selectedBankName,
        bankCode: selectedBankCode || selectedBankId,
        accountNumber: cleanNum,
        accountName: accountName.trim(),
      });

      setSuccess(`@${cleanTag} and bank details saved successfully!`);
      if (onTagSaved) onTagSaved(saved);
      setTimeout(() => {
        if (onClose) onClose();
      }, 1400);
    } catch (err) {
      setError(err.message || 'Failed to save Fiat Tag.');
    } finally {
      setSaving(false);
    }
  };

  // Sorted and filtered banks
  const sortedBanks = useMemo(() => {
    return [...banks].sort((a, b) => {
      const nameA = (a.name || a.bank_name || '').toLowerCase();
      const nameB = (b.name || b.bank_name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [banks]);

  const filteredBanks = useMemo(() => {
    if (!bankSearch.trim()) return sortedBanks;
    const q = bankSearch.toLowerCase().trim();
    return sortedBanks.filter(b =>
      (b.name || b.bank_name || '').toLowerCase().includes(q)
    );
  }, [sortedBanks, bankSearch]);

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
          maxWidth: '440px',
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
          Fiat Tag &amp; Bank Details
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text2, rgba(240, 246, 255, 0.6))', margin: '0 0 18px 0', lineHeight: '1.4' }}>
          Link your personal @tag and bank account for instant one-click P2P payouts.
        </p>

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

        {/* ── Inline PajCash Email Verification Box (Shown only if no session token exists) ── */}
        {!sessionLoading && !sessionToken && (
          <div style={{
            background: 'rgba(34, 211, 238, 0.06)',
            border: '1px solid rgba(34, 211, 238, 0.25)',
            borderRadius: '14px',
            padding: '14px',
            marginBottom: '18px',
          }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--cyan, #22d3ee)', marginBottom: '4px' }}>
              Link Email with PajCash
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text2, rgba(240, 246, 255, 0.6))', marginBottom: '12px', lineHeight: '1.4' }}>
              A verified PajCash session is required to look up and confirm Nigerian bank accounts.
            </div>

            {authError && (
              <div style={{ fontSize: '11px', color: 'var(--red, #f87171)', marginBottom: '10px' }}>
                {authError}
              </div>
            )}

            {authStep === 'email' ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  placeholder="your.email@gmail.com"
                  disabled={authLoading}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: 'rgba(10, 22, 40, 0.8)',
                    border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
                    borderRadius: '10px',
                    color: 'white',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={handleInitiateEmail}
                  disabled={authLoading || !emailInput.trim()}
                  style={{
                    padding: '10px 14px',
                    background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.25), rgba(34, 211, 238, 0.1))',
                    border: '1px solid rgba(34, 211, 238, 0.4)',
                    borderRadius: '10px',
                    color: 'var(--cyan, #22d3ee)',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: (authLoading || !emailInput.trim()) ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {authLoading ? 'Sending...' : 'Send OTP'}
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpInput}
                    onChange={e => setOtpInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 6-digit OTP"
                    disabled={authLoading}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      background: 'rgba(10, 22, 40, 0.8)',
                      border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
                      borderRadius: '10px',
                      color: 'white',
                      fontSize: '13px',
                      letterSpacing: '0.1em',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleVerifyEmail}
                    disabled={authLoading || otpInput.trim().length !== 6}
                    style={{
                      padding: '10px 14px',
                      background: 'linear-gradient(135deg, rgba(163, 230, 53, 0.25), rgba(163, 230, 53, 0.1))',
                      border: '1px solid rgba(163, 230, 53, 0.4)',
                      borderRadius: '10px',
                      color: 'var(--lime, #a3e635)',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: (authLoading || otpInput.trim().length !== 6) ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {authLoading ? 'Verifying...' : 'Confirm'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { setAuthStep('email'); setOtpInput(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text3, rgba(240, 246, 255, 0.45))',
                    fontSize: '11px',
                    cursor: 'pointer',
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  Change email
                </button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSave}>
          {/* Tag Name Input */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text2)', marginBottom: '6px', textTransform: 'uppercase' }}>
              Your Fiat Tag
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(10, 22, 40, 0.8)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
              borderRadius: '12px',
              padding: '0 14px',
            }}>
              <span style={{ color: 'var(--lime, #a3e635)', fontWeight: '700', fontSize: '15px' }}>@</span>
              <input
                type="text"
                value={tagName}
                onChange={e => setTagName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="satoshi"
                maxLength={20}
                style={{
                  width: '100%',
                  padding: '13px 8px',
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '600',
                  outline: 'none',
                  fontFamily: 'var(--ff)',
                }}
              />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3, rgba(240, 246, 255, 0.4))', marginTop: '4px' }}>
              Your unique handle on Fiatwallet (e.g. @{tagName || 'satoshi'})
            </div>
          </div>

          {/* Bank Selection */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text2)', textTransform: 'uppercase' }}>
                Select Bank (Nigeria)
              </label>
              {banks.length > 10 && (
                <input
                  type="text"
                  placeholder="Filter bank..."
                  value={bankSearch}
                  onChange={e => setBankSearch(e.target.value)}
                  style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    background: 'rgba(10, 22, 40, 0.6)',
                    border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
                    borderRadius: '6px',
                    color: 'white',
                    outline: 'none',
                    width: '110px',
                  }}
                />
              )}
            </div>
            <select
              value={selectedBankId}
              onChange={e => {
                const id = e.target.value;
                setSelectedBankId(id);
                const found = banks.find(b => (b.id || b.code) === id);
                if (found) {
                  setSelectedBankName(found.name || found.bank_name || '');
                  setSelectedBankCode(found.code || found.bank_code || '');
                } else {
                  setSelectedBankName('');
                  setSelectedBankCode('');
                }
              }}
              style={{
                width: '100%',
                padding: '13px 14px',
                background: 'rgba(10, 22, 40, 0.8)',
                border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
                borderRadius: '12px',
                color: selectedBankId ? 'white' : 'var(--text3)',
                fontSize: '14px',
                outline: 'none',
                fontFamily: 'var(--ff)',
              }}
            >
              <option value="" style={{ background: '#111e38', color: '#888' }}>
                Select a bank...
              </option>
              {filteredBanks.map((b, i) => {
                const id = b.id || b.code || String(i);
                const name = b.name || b.bank_name;
                return (
                  <option key={id || i} value={id} style={{ background: '#111e38', color: 'white' }}>
                    {name}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Account Number */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text2)', marginBottom: '6px', textTransform: 'uppercase' }}>
              10-Digit Account Number
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0123456789"
              style={{
                width: '100%',
                padding: '13px 14px',
                background: 'rgba(10, 22, 40, 0.8)',
                border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
                borderRadius: '12px',
                color: 'white',
                fontSize: '15px',
                letterSpacing: '0.05em',
                outline: 'none',
                fontFamily: 'var(--mono, monospace)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Resolved Account Name */}
          <div style={{ marginBottom: '22px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text2)', marginBottom: '6px', textTransform: 'uppercase' }}>
              Account Name (Verified)
            </label>
            <div style={{
              padding: '13px 14px',
              background: 'rgba(10, 22, 40, 0.4)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
              borderRadius: '12px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              boxSizing: 'border-box',
            }}>
              {resolving ? (
                <span style={{ fontSize: '13px', color: 'var(--cyan, #22d3ee)' }}>Verifying account with bank...</span>
              ) : accountName ? (
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--lime, #a3e635)' }}>
                  ✓ {accountName}
                </span>
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--text3, rgba(240, 246, 255, 0.35))' }}>
                  Auto-resolved upon selecting bank and entering 10 digits
                </span>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={saving || resolving || !accountName}
            style={{
              width: '100%',
              padding: '15px',
              background: 'linear-gradient(135deg, rgba(163, 230, 53, 0.2), rgba(163, 230, 53, 0.08))',
              border: '1px solid rgba(163, 230, 53, 0.4)',
              borderRadius: '14px',
              color: 'var(--lime, #a3e635)',
              fontSize: '14px',
              fontWeight: '700',
              cursor: (saving || resolving || !accountName) ? 'not-allowed' : 'pointer',
              opacity: (saving || resolving || !accountName) ? 0.5 : 1,
              transition: 'all 0.2s',
              fontFamily: 'var(--ff)',
            }}
          >
            {saving ? 'Saving...' : 'Link & Save Details'}
          </button>
        </form>
      </div>
    </div>
  );
}
