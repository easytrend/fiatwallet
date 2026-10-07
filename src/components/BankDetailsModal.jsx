import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getBanks, resolveBankAccount, initiateSession, verifySession } from '../services/pajcashService';
import { getFiatTagByWallet, registerFiatTag, loadSession, saveSession } from '../services/supabase';

const PAJCASH_API_KEY = import.meta.env.VITE_PAJCASH_API_KEY;

const getBankNameString = (b) => {
  if (!b) return '';
  if (typeof b === 'string') return b;
  return b.name || b.bank_name || b.bankName || b.title || b.label || String(b.id || b.code || '');
};

const BANK_ALIASES = {
  opay: ['paycom', 'opay'],
  paycom: ['opay', 'paycom'],
  palmpay: ['palmpay', 'palm pay'],
  kuda: ['kuda'],
  moniepoint: ['moniepoint', 'teamapt'],
  teamapt: ['moniepoint', 'teamapt'],
  gtb: ['guaranty trust', 'gtbank', 'gtb'],
  gtbank: ['guaranty trust', 'gtbank', 'gtb'],
  uba: ['united bank for africa', 'uba'],
  fbn: ['first bank', 'firstbank', 'fbn'],
  firstbank: ['first bank', 'firstbank', 'fbn'],
  zenith: ['zenith'],
  access: ['access'],
  stanbic: ['stanbic', 'ibtc'],
  sterling: ['sterling'],
  wema: ['wema', 'alat'],
  alat: ['wema', 'alat'],
  vfd: ['vfd', 'vee'],
  fairmoney: ['fairmoney', 'fair money'],
  rubies: ['rubies'],
  carbon: ['carbon'],
  ecobank: ['ecobank', 'eco bank'],
  fidelity: ['fidelity'],
  fcmb: ['first city monument', 'fcmb'],
  heritage: ['heritage'],
  keystone: ['keystone'],
  polaris: ['polaris', 'skye'],
  providus: ['providus'],
  jaiz: ['jaiz'],
  taj: ['taj'],
  union: ['union bank', 'union'],
  unity: ['unity bank', 'unity'],
};

function searchMatchesBank(bankNameStr, rawQuery) {
  if (!bankNameStr || typeof bankNameStr !== 'string') return { isMatch: false, score: 0 };
  const query = rawQuery.toLowerCase().trim();
  if (!query) return { isMatch: true, score: 0 };

  const nameLower = bankNameStr.toLowerCase().trim();
  const nameClean = nameLower.replace(/[^a-z0-9]/g, '');
  const queryClean = query.replace(/[^a-z0-9]/g, '');

  if (!queryClean) return { isMatch: true, score: 0 };

  // 1. Exact match
  if (nameLower === query || nameClean === queryClean) {
    return { isMatch: true, score: 100 };
  }

  // 2. Starts with query
  if (nameLower.startsWith(query) || nameClean.startsWith(queryClean)) {
    return { isMatch: true, score: 85 };
  }

  // 3. Substring match
  if (nameLower.includes(query) || nameClean.includes(queryClean)) {
    return { isMatch: true, score: 65 };
  }

  // 4. Word-start match
  const words = nameLower.split(/[\s\-_()]+/);
  const wordStartsWith = words.some(w => w.startsWith(queryClean));
  if (wordStartsWith) {
    return { isMatch: true, score: 70 };
  }

  // 5. Alias match
  for (const [key, aliases] of Object.entries(BANK_ALIASES)) {
    if (queryClean === key || aliases.some(a => a.replace(/[^a-z0-9]/g, '') === queryClean)) {
      if (aliases.some(a => nameLower.includes(a.toLowerCase()))) {
        return { isMatch: true, score: 90 };
      }
    }
  }

  return { isMatch: false, score: 0 };
}

export default function BankDetailsModal({ walletAddress, isGuest = false, onClose, onTagSaved }) {
  const [manualTagModalWallet, setManualTagModalWallet] = useState(() => {
    return walletAddress || (typeof localStorage !== 'undefined' ? localStorage.getItem('paj_manual_wallet') : '') || '';
  });

  const [userTagData, setUserTagData] = useState(null);
  const [tagModalInput, setTagModalInput] = useState('');
  const [tagModalBank, setTagModalBank] = useState('Choose Bank');
  const [tagModalAcctNumber, setTagModalAcctNumber] = useState('');
  const [tagModalAcctName, setTagModalAcctName] = useState('');
  const [tagModalResolving, setTagModalResolving] = useState(false);
  const [tagModalSaving, setTagModalSaving] = useState(false);
  const [tagModalError, setTagModalError] = useState('');
  const [tagModalSuccess, setTagModalSuccess] = useState('');

  // Searchable bank dropdown state
  const [bankOpen, setBankOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [apiBanks, setApiBanks] = useState([]);

  // Session state
  const [sessionToken, setSessionToken] = useState('');
  const [sessionEmail, setSessionEmail] = useState('');
  const [sessionLoading, setSessionLoading] = useState(true);

  // Inline email OTP state (fallback if no active session exists)
  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [authStep, setAuthStep] = useState('email'); // 'email' | 'otp'
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const isGuestMode = isGuest || !walletAddress;
  const effectiveWallet = (walletAddress || manualTagModalWallet || '').trim();

  // 1. Restore PajCash session
  useEffect(() => {
    let isMounted = true;
    async function restoreSession() {
      setSessionLoading(true);
      try {
        if (effectiveWallet) {
          const cachedToken = localStorage.getItem(`paj_sessionToken_${effectiveWallet}`);
          const cachedExpiry = localStorage.getItem(`paj_sessionExpiry_${effectiveWallet}`);
          const cachedEmail = localStorage.getItem(`paj_sessionEmail_${effectiveWallet}`);

          if (cachedToken && (!cachedExpiry || Date.now() < Number(cachedExpiry))) {
            if (isMounted) {
              setSessionToken(cachedToken);
              setSessionEmail(cachedEmail || '');
              setSessionLoading(false);
            }
            return;
          }

          // Check Supabase paj_sessions table
          try {
            const row = await loadSession(effectiveWallet);
            if (row?.session_token && isMounted) {
              const expiryMs = row.expires_at
                ? new Date(row.expires_at).getTime()
                : Date.now() + 20 * 365 * 24 * 60 * 60 * 1000;

              setSessionToken(row.session_token);
              setSessionEmail(row.email || '');
              setSessionLoading(false);

              localStorage.setItem(`paj_sessionToken_${effectiveWallet}`, row.session_token);
              if (row.email) localStorage.setItem(`paj_sessionEmail_${effectiveWallet}`, row.email);
              localStorage.setItem(`paj_sessionExpiry_${effectiveWallet}`, String(expiryMs));
              return;
            }
          } catch (e) {
            console.warn('[BankDetailsModal] Supabase session lookup warning:', e);
          }
        }

        // Check manual / guest session
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

        // Check any active paj_sessionToken_ in localStorage
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

    restoreSession();
    return () => { isMounted = false; };
  }, [effectiveWallet]);

  // 2. Load existing Fiat Tag & full account details
  useEffect(() => {
    if (!effectiveWallet || effectiveWallet.length < 32) {
      setUserTagData(null);
      return;
    }

    let isMounted = true;
    getFiatTagByWallet(effectiveWallet)
      .then(tag => {
        if (!isMounted) return;
        if (tag) {
          setUserTagData(tag);
          setTagModalInput(tag.tag_name ? (tag.tag_name.startsWith('$') ? tag.tag_name : `$${tag.tag_name}`) : '');
          setTagModalBank(tag.bank_name || 'Choose Bank');
          setTagModalAcctNumber(tag.account_number || '');
          setTagModalAcctName(tag.account_name || '');
        } else {
          setUserTagData(null);
        }
      })
      .catch(() => {
        if (isMounted) setUserTagData(null);
      });

    return () => { isMounted = false; };
  }, [effectiveWallet]);

  // 3. Fetch supported banks
  useEffect(() => {
    let isMounted = true;
    getBanks(sessionToken || PAJCASH_API_KEY || undefined)
      .then(list => {
        const arr = Array.isArray(list) ? list : (list?.data || []);
        if (arr.length > 0 && isMounted) {
          setApiBanks(arr);
        }
      })
      .catch(() => {
        // Fallback to public endpoint
        fetch('https://api.paj.cash/pub/bank')
          .then(r => r.json())
          .then(arr => {
            const list = Array.isArray(arr) ? arr : (arr?.data || []);
            if (list.length > 0 && isMounted) {
              setApiBanks(list);
            }
          })
          .catch(() => {});
      });

    return () => { isMounted = false; };
  }, [sessionToken]);

  // Compute sorted unique bank names
  const allBankNames = useMemo(() => {
    const names = apiBanks.map(b => getBankNameString(b)).filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [apiBanks]);

  // Filtered bank names based on search query
  const filteredBanksList = useMemo(() => {
    const query = bankSearch.trim();
    if (!query) return allBankNames;

    const scored = [];
    for (const b of allBankNames) {
      const match = searchMatchesBank(b, query);
      if (match.isMatch) {
        scored.push({ name: b, score: match.score });
      }
    }

    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return scored.map(s => s.name);
  }, [allBankNames, bankSearch]);

  // 4. Auto-resolve account name in Tag Registration modal
  useEffect(() => {
    if (!tagModalAcctNumber || tagModalBank === 'Choose Bank') {
      return;
    }
    const cleanNum = tagModalAcctNumber.replace(/\D/g, '').trim();
    if (cleanNum.length !== 10) return;

    if (sessionLoading) return;

    if (!sessionToken) {
      setTagModalAcctName('');
      setTagModalError('PajCash verification required. Please link your email below.');
      return;
    }

    setTagModalResolving(true);
    setTagModalError('');

    const bankObj = apiBanks.find(b => getBankNameString(b) === tagModalBank);
    const bankId = bankObj ? (bankObj.id || bankObj.code || bankObj.name) : tagModalBank;

    const timer = setTimeout(() => {
      resolveBankAccount(sessionToken, bankId, cleanNum)
        .then(res => {
          const name = res?.accountName || res?.name || res?.account_name || res?.data?.account_name || res?.data?.accountName || '';
          setTagModalAcctName(name || 'No Bank Match');
          if (name) {
            setTagModalError('');
          } else {
            setTagModalError('Could not verify account name. Please check your bank and account number.');
          }
        })
        .catch(err => {
          setTagModalAcctName('No Bank Match');
          const msg = err?.message || 'Error resolving bank account.';
          setTagModalError(msg);
          if (
            msg.toLowerCase().includes('session') ||
            msg.toLowerCase().includes('expired') ||
            msg.toLowerCase().includes('unauthorized') ||
            msg.toLowerCase().includes('invalid token')
          ) {
            setSessionToken('');
            if (effectiveWallet) {
              localStorage.removeItem(`paj_sessionToken_${effectiveWallet}`);
              localStorage.removeItem(`paj_sessionExpiry_${effectiveWallet}`);
            }
          }
        })
        .finally(() => setTagModalResolving(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [tagModalAcctNumber, tagModalBank, sessionToken, sessionLoading, apiBanks, effectiveWallet]);

  // 5. Handle inline email OTP initiation
  const handleInitiateEmail = async () => {
    if (!emailInput.trim()) {
      setAuthError('Please enter your email.');
      return;
    }
    if (!PAJCASH_API_KEY) {
      setAuthError('PajCash API key is not configured.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');
    try {
      await initiateSession(emailInput.trim(), PAJCASH_API_KEY);
      setAuthStep('otp');
    } catch (err) {
      setAuthError(err.message || 'Failed to send OTP code.');
    } finally {
      setAuthLoading(false);
    }
  };

  // 6. Handle inline email OTP verification
  const handleVerifyEmail = async () => {
    if (!otpInput.trim() || otpInput.trim().length < 4) {
      setAuthError('Please enter the 4-digit OTP code.');
      return;
    }
    if (!PAJCASH_API_KEY) {
      setAuthError('PajCash API key is not configured.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await verifySession(emailInput.trim(), otpInput.trim(), PAJCASH_API_KEY);
      if (res?.token) {
        setSessionToken(res.token);
        setSessionEmail(emailInput.trim());
        setTagModalError('');
        setAuthError('');

        const expiryMs = Date.now() + 20 * 365 * 24 * 60 * 60 * 1000;
        if (effectiveWallet) {
          localStorage.setItem(`paj_sessionToken_${effectiveWallet}`, res.token);
          localStorage.setItem(`paj_sessionEmail_${effectiveWallet}`, emailInput.trim());
          localStorage.setItem(`paj_sessionExpiry_${effectiveWallet}`, String(expiryMs));
          saveSession(effectiveWallet, emailInput.trim(), res.token, expiryMs);
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

  // 7. Save user's Fiat Tag to Supabase
  const handleSaveFiatTag = useCallback(async () => {
    if (!effectiveWallet) {
      setTagModalError('Please enter your Solana wallet address.');
      return;
    }
    if (effectiveWallet.length < 32 || effectiveWallet.length > 44) {
      setTagModalError('Please enter a valid Solana wallet address (32-44 characters).');
      return;
    }
    if (!sessionToken) {
      setTagModalError('Please verify your email first before creating a Fiat Tag.');
      return;
    }
    const cleanTag = tagModalInput.trim().replace(/^@/, '').replace(/^\$/, '');
    if (!cleanTag || cleanTag.length < 3) {
      setTagModalError('Please enter a valid tag name (minimum 3 characters).');
      return;
    }
    if (tagModalBank === 'Choose Bank') {
      setTagModalError('Please select a bank.');
      return;
    }
    const cleanAcct = tagModalAcctNumber.replace(/\D/g, '').trim();
    if (cleanAcct.length !== 10) {
      setTagModalError('Please enter a valid 10-digit account number.');
      return;
    }
    if (!tagModalAcctName || tagModalAcctName === 'No Bank Match') {
      setTagModalError('Account name could not be verified. Please check account details.');
      return;
    }

    setTagModalSaving(true);
    setTagModalError('');
    setTagModalSuccess('');

    try {
      const bankObj = apiBanks.find(b => getBankNameString(b) === tagModalBank);
      const bankCode = bankObj ? (bankObj.code || bankObj.id) : null;

      const registered = await registerFiatTag({
        walletAddress: effectiveWallet,
        tagName: `$${cleanTag}`,
        bankName: tagModalBank,
        bankCode,
        accountNumber: cleanAcct,
        accountName: tagModalAcctName,
      });

      localStorage.setItem('paj_manual_wallet', effectiveWallet);
      if (sessionToken) {
        const expiryMs = Date.now() + 20 * 365 * 24 * 60 * 60 * 1000;
        saveSession(effectiveWallet, sessionEmail || emailInput?.trim() || '', sessionToken, expiryMs);
      }

      setUserTagData(registered);
      setTagModalSuccess(`$${cleanTag} saved successfully!`);
      if (onTagSaved) onTagSaved(registered);

      setTimeout(() => {
        if (onClose) onClose();
      }, 1200);
    } catch (err) {
      setTagModalError(err.message || 'Failed to save Fiat Tag.');
    } finally {
      setTagModalSaving(false);
    }
  }, [effectiveWallet, sessionToken, tagModalInput, tagModalBank, tagModalAcctNumber, tagModalAcctName, apiBanks, sessionEmail, emailInput, onTagSaved, onClose]);

  return (
    <div
      className="p2p-success-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#131822',
          border: '1px solid rgba(163, 230, 53, 0.4)',
          borderRadius: '24px',
          padding: '28px 24px',
          width: '92%',
          maxWidth: '400px',
          position: 'relative',
          boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 30px rgba(163,230,53,0.15)',
          animation: 'slideUpCard 0.3s ease',
          maxHeight: '92vh',
          overflowY: 'auto',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: '16px',
            right: '18px',
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </button>

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'white', marginBottom: '6px' }}>
            {userTagData ? 'Edit Your Fiat Tag' : 'Create & Link Fiat Tag'}
          </h3>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: '1.4' }}>
            Link your bank account to a unique Fiat Tag so others can send you payouts using just your Tag.
          </p>
        </div>

        {tagModalError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            padding: '10px 12px',
            fontSize: '11px',
            color: '#f87171',
            marginBottom: '14px',
            lineHeight: '1.4',
          }}>
            {tagModalError}
          </div>
        )}

        {tagModalSuccess && (
          <div style={{
            background: 'rgba(163, 230, 53, 0.1)',
            border: '1px solid rgba(163, 230, 53, 0.3)',
            borderRadius: '10px',
            padding: '10px 12px',
            fontSize: '11px',
            color: 'var(--lime)',
            marginBottom: '14px',
            lineHeight: '1.4',
          }}>
            ✓ {tagModalSuccess}
          </div>
        )}

        {/* ── Inline PajCash Email Verification (Shown only when session is missing) ── */}
        {!sessionLoading && !sessionToken && (
          <div style={{
            background: 'rgba(34, 211, 238, 0.06)',
            border: '1px solid rgba(34, 211, 238, 0.25)',
            borderRadius: '14px',
            padding: '12px 14px',
            marginBottom: '16px',
          }}>
            <div style={{ fontSize: '11.5px', fontWeight: '700', color: 'var(--cyan, #22d3ee)', marginBottom: '3px' }}>
              Link Email with PajCash
            </div>
            <div style={{ fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '10px', lineHeight: '1.35' }}>
              A verified PajCash session is required to link and confirm bank accounts.
            </div>

            {authError && (
              <div style={{ fontSize: '10.5px', color: '#f87171', marginBottom: '8px' }}>
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
                    padding: '8px 10px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={handleInitiateEmail}
                  disabled={authLoading || !emailInput.trim()}
                  style={{
                    padding: '8px 12px',
                    background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.25), rgba(34, 211, 238, 0.1))',
                    border: '1px solid rgba(34, 211, 238, 0.4)',
                    borderRadius: '8px',
                    color: 'var(--cyan, #22d3ee)',
                    fontSize: '11.5px',
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
                    placeholder="Enter 4-digit OTP"
                    disabled={authLoading}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '12px',
                      letterSpacing: '0.1em',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleVerifyEmail}
                    disabled={authLoading || otpInput.trim().length < 4}
                    style={{
                      padding: '8px 12px',
                      background: 'linear-gradient(135deg, rgba(163, 230, 53, 0.25), rgba(163, 230, 53, 0.1))',
                      border: '1px solid rgba(163, 230, 53, 0.4)',
                      borderRadius: '8px',
                      color: 'var(--lime, #a3e635)',
                      fontSize: '11.5px',
                      fontWeight: '700',
                      cursor: (authLoading || otpInput.trim().length < 4) ? 'not-allowed' : 'pointer',
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
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: '10.5px',
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

        {/* ── Wallet Address Field (Shown in Guest / Manual Mode) ── */}
        {isGuestMode && (
          <div className="field" style={{ marginBottom: '14px' }}>
            <div className="field-label">Your Solana Wallet Address</div>
            <div className="input-wrap">
              <input
                type="text"
                value={manualTagModalWallet}
                onChange={e => setManualTagModalWallet(e.target.value.trim())}
                placeholder="Enter Solana wallet address (e.g. 7xK...)"
                style={{ fontSize: '13px', fontWeight: '500', fontFamily: 'monospace' }}
              />
            </div>
            <div style={{ marginTop: '4px', fontSize: '10.5px', color: 'rgba(255,255,255,0.45)' }}>
              Used to link your Fiat Tag and verify past transaction history.
            </div>
          </div>
        )}

        {/* ── Tag Name Field ── */}
        <div className="field" style={{ marginBottom: '14px' }}>
          <div className="field-label">Fiat Tag Name</div>
          <div className="input-wrap" style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ color: 'var(--lime)', fontWeight: '700', fontSize: '15px', marginRight: '4px' }}>$</span>
            <input
              type="text"
              value={tagModalInput.replace(/^\$/, '')}
              onChange={e => {
                const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                setTagModalInput(val ? `$${val}` : '');
              }}
              placeholder="yourtag"
              style={{ fontSize: '14px', fontWeight: '600', flex: 1 }}
            />
          </div>
        </div>

        {/* ── Bank Selector ── */}
        <div className="field" style={{ marginBottom: '14px', position: 'relative' }}>
          <div className="field-label">Bank</div>
          <div
            className="input-wrap"
            onClick={() => setBankOpen(v => !v)}
            style={{ cursor: 'pointer', justifyContent: 'space-between' }}
          >
            <span>{tagModalBank}</span>
            <span style={{ fontSize: '11px', color: 'var(--text3)' }}>▼</span>
          </div>
          {bankOpen && (
            <div className="drop-menu" style={{ left: 0, right: 0, width: '100%', zIndex: 1000 }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
                <input
                  type="text"
                  placeholder="Search bank..."
                  value={bankSearch}
                  autoFocus
                  onChange={e => setBankSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'white',
                    fontSize: '12px',
                  }}
                />
              </div>
              <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                {filteredBanksList.map(b => (
                  <div
                    key={b}
                    className={`drop-item ${tagModalBank === b ? 'sel' : ''}`}
                    onClick={() => {
                      setTagModalBank(b);
                      setBankOpen(false);
                      setBankSearch('');
                    }}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px' }}
                  >
                    {b}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Account Number Field ── */}
        <div className="field" style={{ marginBottom: '14px' }}>
          <div className="field-label">10-Digit Account Number</div>
          <div className="input-wrap">
            <input
              type="text"
              maxLength={10}
              value={tagModalAcctNumber}
              onChange={e => setTagModalAcctNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="0000000000"
              style={{ fontSize: '14px', fontWeight: '600' }}
            />
          </div>
          <div style={{ marginTop: '4px', minHeight: '14px', fontSize: '11px', color: 'var(--lime)', fontWeight: 'bold' }}>
            {tagModalResolving ? (
              <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>Resolving account...</span>
            ) : tagModalAcctName ? (
              <span>{tagModalAcctName}</span>
            ) : null}
          </div>
        </div>

        {/* ── Action Button ── */}
        <button
          className="send-btn"
          onClick={handleSaveFiatTag}
          disabled={tagModalSaving || tagModalResolving}
          style={{ marginTop: '10px' }}
        >
          {tagModalSaving ? 'Saving Tag...' : (userTagData ? 'Update Fiat Tag' : 'Create Fiat Tag')}
        </button>
      </div>
    </div>
  );
}
