import { useState, useEffect } from 'react';
import { getBanks, resolveBankAccount } from '../services/pajcashService';
import { getFiatTagByWallet, registerFiatTag } from '../services/supabase';

export default function BankDetailsModal({ walletAddress, onClose, onTagSaved }) {
  const [tagName, setTagName] = useState('');
  const [banks, setBanks] = useState([]);
  const [selectedBankCode, setSelectedBankCode] = useState('');
  const [selectedBankName, setSelectedBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [bankSearch, setBankSearch] = useState('');

  // 1. Load existing tag if any
  useEffect(() => {
    if (!walletAddress) return;
    getFiatTagByWallet(walletAddress)
      .then(tag => {
        if (tag) {
          setTagName(tag.tag_name ? tag.tag_name.replace('$', '') : '');
          setSelectedBankName(tag.bank_name || '');
          setSelectedBankCode(tag.bank_code || '');
          setAccountNumber(tag.account_number || '');
          setAccountName(tag.account_name || '');
        }
      })
      .catch(err => console.warn('Error loading tag:', err));
  }, [walletAddress]);

  // 2. Fetch supported banks
  useEffect(() => {
    getBanks()
      .then(res => {
        const list = Array.isArray(res) ? res : (res?.data || []);
        setBanks(list);
      })
      .catch(err => console.warn('Error loading banks:', err));
  }, []);

  // 3. Auto-resolve bank account when 10 digits and bank selected
  useEffect(() => {
    if (accountNumber.trim().length === 10 && selectedBankCode) {
      setResolving(true);
      setError('');
      resolveBankAccount(accountNumber.trim(), selectedBankCode)
        .then(res => {
          const resolvedName = res?.account_name || res?.accountName || res?.data?.account_name || '';
          if (resolvedName) {
            setAccountName(resolvedName);
          } else {
            setAccountName('');
            setError('Could not verify account name. Please check account number.');
          }
        })
        .catch(err => {
          setAccountName('');
          setError(err.message || 'Error resolving bank account.');
        })
        .finally(() => setResolving(false));
    }
  }, [accountNumber, selectedBankCode]);

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
    if (!selectedBankName) {
      setError('Please select your bank.');
      return;
    }
    if (accountNumber.trim().length !== 10) {
      setError('Please enter a valid 10-digit Nigerian account number.');
      return;
    }
    if (!accountName.trim()) {
      setError('Account name could not be resolved. Please verify your details.');
      return;
    }

    setSaving(true);
    try {
      const saved = await registerFiatTag({
        walletAddress,
        tagName: `$${cleanTag}`,
        bankName: selectedBankName,
        bankCode: selectedBankCode,
        accountNumber: accountNumber.trim(),
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

  const filteredBanks = banks.filter(b =>
    (b.name || b.bank_name || '').toLowerCase().includes(bankSearch.toLowerCase())
  );

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
          Fiat Tag &amp; Bank Details
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text2, rgba(240, 246, 255, 0.6))', margin: '0 0 20px 0', lineHeight: '1.4' }}>
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
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text2)', marginBottom: '6px', textTransform: 'uppercase' }}>
              Select Bank (Nigeria)
            </label>
            <select
              value={selectedBankCode}
              onChange={e => {
                const code = e.target.value;
                setSelectedBankCode(code);
                const found = banks.find(b => (b.code || b.bank_code) === code);
                setSelectedBankName(found ? (found.name || found.bank_name) : '');
              }}
              style={{
                width: '100%',
                padding: '13px 14px',
                background: 'rgba(10, 22, 40, 0.8)',
                border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
                borderRadius: '12px',
                color: selectedBankCode ? 'white' : 'var(--text3)',
                fontSize: '14px',
                outline: 'none',
                fontFamily: 'var(--ff)',
              }}
            >
              <option value="" style={{ background: '#111e38', color: '#888' }}>
                Select a bank...
              </option>
              {banks.map((b, i) => {
                const code = b.code || b.bank_code;
                const name = b.name || b.bank_name;
                return (
                  <option key={code || i} value={code} style={{ background: '#111e38', color: 'white' }}>
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
                  Auto-resolved upon entering bank and account number
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
