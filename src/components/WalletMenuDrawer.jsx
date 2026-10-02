import { useState, useEffect } from 'react';
import logoImg from '../assets/logo.png';
import { getFiatTagByWallet } from '../services/supabase';

export default function WalletMenuDrawer({
  isOpen,
  onClose,
  walletAddress,
  isInternal,
  onOpenBankDetails,
  onOpenSecurity,
  onOpenTerms,
  onOpenSupportChat,
  onLock,
  onLogout,
}) {
  const [fiatTag, setFiatTag] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!walletAddress) return;
    getFiatTagByWallet(walletAddress)
      .then(tag => {
        if (tag && tag.tag_name) {
          setFiatTag(tag.tag_name.startsWith('$') ? tag.tag_name.replace('$', '@') : `@${tag.tag_name}`);
        } else {
          setFiatTag(null);
        }
      })
      .catch(() => setFiatTag(null));
  }, [walletAddress, isOpen]);

  const handleCopyAddr = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shortAddr = walletAddress ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}` : '';

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        background: 'rgba(5, 11, 20, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '85%',
          maxWidth: '320px',
          height: '100%',
          background: 'var(--navy, #0a1628)',
          borderRight: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '10px 0 30px rgba(0, 0, 0, 0.5)',
          fontFamily: 'var(--ff, sans-serif)',
          color: 'var(--text, #f0f6ff)',
          padding: '24px 20px',
          boxSizing: 'border-box',
          overflowY: 'auto',
          animation: 'slideInLeft 0.25s ease',
        }}
      >
        {/* Drawer Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src={logoImg} alt="Fiatwallet" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
            <div>
              <div style={{ fontWeight: '800', fontSize: '17px', color: 'white', letterSpacing: '-0.01em' }}>
                Fiatwallet
              </div>
              <div style={{ fontSize: '10px', color: 'var(--lime, #a3e635)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Self-Custodial
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text2, rgba(240, 246, 255, 0.6))',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* User Identity Card */}
        {walletAddress && (
          <div
            style={{
              background: 'rgba(17, 30, 56, 0.6)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
              borderRadius: '16px',
              padding: '14px',
              marginBottom: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text3, rgba(240, 246, 255, 0.45))', textTransform: 'uppercase', fontWeight: '700' }}>
                Active Account
              </span>
              <button
                onClick={handleCopyAddr}
                style={{
                  background: 'none',
                  border: 'none',
                  color: copied ? 'var(--lime)' : 'var(--cyan)',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <div style={{ fontFamily: 'var(--mono, monospace)', fontSize: '12px', fontWeight: '600', color: 'white' }}>
              {shortAddr}
            </div>

            {/* Fiat Tag Badge */}
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', color: 'var(--text2)' }}>Fiat Tag:</span>
              {fiatTag ? (
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--lime, #a3e635)' }}>
                  {fiatTag}
                </span>
              ) : (
                <button
                  onClick={() => { onClose(); onOpenBankDetails(); }}
                  style={{
                    background: 'rgba(163, 230, 53, 0.1)',
                    border: '1px solid rgba(163, 230, 53, 0.3)',
                    borderRadius: '6px',
                    color: 'var(--lime, #a3e635)',
                    fontSize: '10px',
                    fontWeight: '700',
                    padding: '3px 8px',
                    cursor: 'pointer',
                  }}
                >
                  + Link Tag
                </button>
              )}
            </div>
          </div>
        )}

        {/* Menu Items List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          {/* 1. Tag & Bank Details */}
          <button
            onClick={() => { onClose(); onOpenBankDetails(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '14px 16px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
              borderRadius: '14px',
              color: 'white',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.2s',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--lime)', fontWeight: '800' }}>@</span>
                <span>Fiat Tag &amp; Bank Details</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', fontWeight: '400' }}>
                Link bank account for instant payouts
              </div>
            </div>
            <span style={{ color: 'var(--text3)' }}>→</span>
          </button>

          {/* 2. Security & Settings */}
          <button
            onClick={() => { onClose(); onOpenSecurity(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '14px 16px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
              borderRadius: '14px',
              color: 'white',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.2s',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--cyan)' }}>•</span>
                <span>Wallet Settings &amp; Security</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', fontWeight: '400' }}>
                Seed phrase, PIN, lock &amp; keys
              </div>
            </div>
            <span style={{ color: 'var(--text3)' }}>→</span>
          </button>

          {/* 3. Terms & Privacy */}
          <button
            onClick={() => { onClose(); onOpenTerms(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '14px 16px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
              borderRadius: '14px',
              color: 'white',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.2s',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--text2)' }}>•</span>
                <span>Terms &amp; Privacy Policy</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', fontWeight: '400' }}>
                Decentralized non-custodial terms
              </div>
            </div>
            <span style={{ color: 'var(--text3)' }}>→</span>
          </button>

          {/* 4. Support Channels */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
              borderRadius: '14px',
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'white', marginBottom: '8px' }}>
              Support Channels
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => { onClose(); onOpenSupportChat(); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--cyan, #22d3ee)',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  textAlign: 'left',
                  padding: 0,
                }}
              >
                • Live In-App Chat Support →
              </button>
              <a
                href="https://t.me/fiatwallet_support"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--text2)',
                  fontSize: '12px',
                  textDecoration: 'none',
                  fontWeight: '500',
                }}
              >
                • Telegram Community Support →
              </a>
              <a
                href="https://wa.me/2348000000000"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--text2)',
                  fontSize: '12px',
                  textDecoration: 'none',
                  fontWeight: '500',
                }}
              >
                • WhatsApp Support Rail →
              </a>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          {isInternal ? (
            <button
              onClick={() => { onClose(); onLock(); }}
              style={{
                width: '100%',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--border2)',
                borderRadius: '12px',
                color: 'white',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                marginBottom: '10px',
              }}
            >
              Lock Wallet
            </button>
          ) : (
            <button
              onClick={() => { onClose(); onLogout(); }}
              style={{
                width: '100%',
                padding: '12px',
                background: 'rgba(248, 113, 113, 0.1)',
                border: '1px solid rgba(248, 113, 113, 0.3)',
                borderRadius: '12px',
                color: 'var(--red, #f87171)',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                marginBottom: '10px',
              }}
            >
              Disconnect Wallet
            </button>
          )}

          <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text3, rgba(240, 246, 255, 0.35))' }}>
            Fiatwallet v2.4.0 • Non-custodial
          </div>
        </div>
      </div>
    </div>
  );
}
