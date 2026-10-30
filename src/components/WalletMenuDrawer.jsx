import { useState, useEffect } from 'react';
import logoImg from '../assets/logo.png';
import { getFiatTagByWallet } from '../services/supabase';

export default function WalletMenuDrawer({
  isOpen,
  onClose,
  walletAddress,
  isInternal,
  onOpenHistory, // Preserved for API compatibility
  onOpenLeaderboard,
  onOpenReferralLeaderboard,
  onOpenBankDetails,
  onOpenSecurity,
  onOpenTerms,
  onOpenSupportChat,
  onLock,
  onLogout,
}) {
  const [fiatTag, setFiatTag] = useState(null);
  const [copied, setCopied] = useState(false);

  const effectiveAddr = walletAddress || (typeof localStorage !== 'undefined' ? localStorage.getItem('paj_manual_wallet') : '') || '';

  useEffect(() => {
    if (!effectiveAddr) {
      setFiatTag(null);
      return;
    }
    getFiatTagByWallet(effectiveAddr)
      .then(tag => {
        if (tag && tag.tag_name) {
          setFiatTag(tag.tag_name.startsWith('$') ? tag.tag_name.replace('$', '@') : `@${tag.tag_name}`);
        } else {
          setFiatTag(null);
        }
      })
      .catch(() => setFiatTag(null));
  }, [effectiveAddr, isOpen]);

  const handleCopyAddr = () => {
    if (!effectiveAddr) return;
    navigator.clipboard.writeText(effectiveAddr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shortAddr = effectiveAddr ? `${effectiveAddr.slice(0, 4)}...${effectiveAddr.slice(-4)}` : '';

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
          borderRight: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '10px 0 30px rgba(0, 0, 0, 0.5)',
          fontFamily: 'var(--ff, sans-serif)',
          color: 'var(--text, #f0f6ff)',
          padding: '22px 18px',
          boxSizing: 'border-box',
          overflowY: 'auto',
          animation: 'slideInLeft 0.25s ease',
        }}
      >
        {/* Drawer Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src={logoImg} alt="Fiatwallet" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
            <div>
              <div style={{ fontWeight: '800', fontSize: '16px', color: 'white', letterSpacing: '-0.01em' }}>
                Fiatwallet
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text3, #94a3b8)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
              color: 'var(--text3, #94a3b8)',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* User Account Bar */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '12px',
            padding: '11px 13px',
            marginBottom: '18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '10.5px', color: 'var(--text3, #94a3b8)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.04em' }}>
              {effectiveAddr ? 'Connected Wallet' : 'Guest Session'}
            </span>
            {effectiveAddr && (
              <button
                onClick={handleCopyAddr}
                style={{
                  background: 'none',
                  border: 'none',
                  color: copied ? 'var(--lime, #a3e635)' : 'var(--text3, #94a3b8)',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            )}
          </div>
          <div style={{ fontFamily: 'var(--mono, monospace)', fontSize: '12px', fontWeight: '600', color: 'white' }}>
            {effectiveAddr ? shortAddr : 'Guest Mode'}
          </div>

          {/* Fiat Tag Row */}
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', color: 'var(--text3, #94a3b8)' }}>Fiat Tag:</span>
            {fiatTag ? (
              <span style={{ fontSize: '11.5px', fontWeight: '700', color: 'white' }}>
                {fiatTag}
              </span>
            ) : (
              <button
                onClick={() => { onClose(); onOpenBankDetails(); }}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '10px',
                  fontWeight: '600',
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                + Link Tag
              </button>
            )}
          </div>
        </div>

        {/* Clean Menu Navigation List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
          {/* 1. Tag & Bank Details */}
          <button
            onClick={() => { onClose(); onOpenBankDetails(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '11px 12px',
              background: 'transparent',
              border: 'none',
              borderRadius: '10px',
              color: 'white',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              <div>
                <div style={{ color: 'white', fontWeight: '600', fontSize: '13px' }}>
                  Fiat Tag &amp; Bank Details
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3, #94a3b8)', marginTop: '1px' }}>
                  Bank accounts for instant payouts
                </div>
              </div>
            </div>
            <span style={{ color: '#64748b', fontSize: '13px' }}>→</span>
          </button>

          {/* 2. Points Leaderboard */}
          <button
            onClick={() => { onClose(); onOpenLeaderboard && onOpenLeaderboard(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '11px 12px',
              background: 'transparent',
              border: 'none',
              borderRadius: '10px',
              color: 'white',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="6" />
                <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
              </svg>
              <div>
                <div style={{ color: 'white', fontWeight: '600', fontSize: '13px' }}>
                  Points Leaderboard
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3, #94a3b8)', marginTop: '1px' }}>
                  Volume points &amp; tier rankings
                </div>
              </div>
            </div>
            <span style={{ color: '#64748b', fontSize: '13px' }}>→</span>
          </button>

          {/* 3. Referral Leaderboard */}
          <button
            onClick={() => { onClose(); onOpenReferralLeaderboard && onOpenReferralLeaderboard(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '11px 12px',
              background: 'transparent',
              border: 'none',
              borderRadius: '10px',
              color: 'white',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <div>
                <div style={{ color: 'white', fontWeight: '600', fontSize: '13px' }}>
                  Referral Leaderboard
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3, #94a3b8)', marginTop: '1px' }}>
                  Rankings of top community referrers
                </div>
              </div>
            </div>
            <span style={{ color: '#64748b', fontSize: '13px' }}>→</span>
          </button>

          {/* 4. Security & Settings */}
          <button
            onClick={() => { onClose(); onOpenSecurity(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '11px 12px',
              background: 'transparent',
              border: 'none',
              borderRadius: '10px',
              color: 'white',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <div>
                <div style={{ color: 'white', fontWeight: '600', fontSize: '13px' }}>
                  Security &amp; Settings
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3, #94a3b8)', marginTop: '1px' }}>
                  Seed phrase, PIN, lock &amp; keys
                </div>
              </div>
            </div>
            <span style={{ color: '#64748b', fontSize: '13px' }}>→</span>
          </button>

          {/* 5. Terms & Privacy */}
          <button
            onClick={() => { onClose(); onOpenTerms(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '11px 12px',
              background: 'transparent',
              border: 'none',
              borderRadius: '10px',
              color: 'white',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                <path d="M6 6h10" />
                <path d="M6 10h10" />
              </svg>
              <div>
                <div style={{ color: 'white', fontWeight: '600', fontSize: '13px' }}>
                  Terms &amp; Privacy Policy
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3, #94a3b8)', marginTop: '1px' }}>
                  Non-custodial user agreements
                </div>
              </div>
            </div>
            <span style={{ color: '#64748b', fontSize: '13px' }}>→</span>
          </button>

          {/* Divider */}
          <div style={{ margin: '12px 0 8px 0', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }} />

          {/* 6. Support Chat */}
          <button
            onClick={() => { onClose(); onOpenSupportChat(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '11px 12px',
              background: 'transparent',
              border: 'none',
              borderRadius: '10px',
              color: 'white',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <div>
                <div style={{ color: 'white', fontWeight: '600', fontSize: '13px' }}>
                  Live Support Chat
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3, #94a3b8)', marginTop: '1px' }}>
                  In-app help &amp; ticket assistance
                </div>
              </div>
            </div>
            <span style={{ color: '#64748b', fontSize: '13px' }}>→</span>
          </button>

          {/* Clean Community Social Channels */}
          <div style={{ padding: '6px 12px 2px 12px' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--text3, #94a3b8)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
              Community Channels
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Telegram */}
              <a
                href="https://t.me/fiatwalletApp"
                target="_blank"
                rel="noopener noreferrer"
                title="Telegram Community"
                aria-label="Telegram"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: '#94a3b8',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; e.currentTarget.style.color = '#94a3b8'; }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.19 13.697 4.23 12.82c-.654-.204-.666-.654.136-.967l10.83-4.175c.55-.204 1.027.12.698.543z"/>
                </svg>
              </a>

              {/* WhatsApp */}
              <a
                href="https://chat.whatsapp.com/DaG8EHRv7xl1Zx7JunmPy4"
                target="_blank"
                rel="noopener noreferrer"
                title="WhatsApp Rail"
                aria-label="WhatsApp"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: '#94a3b8',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; e.currentTarget.style.color = '#94a3b8'; }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </a>

              {/* X / Twitter */}
              <a
                href="https://x.com/fiatwallet"
                target="_blank"
                rel="noopener noreferrer"
                title="X (Twitter)"
                aria-label="X"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: '#94a3b8',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; e.currentTarget.style.color = '#94a3b8'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>

              {/* LinkedIn */}
              <a
                href="https://www.linkedin.com/in/easytrend-fiatwallet-370179414"
                target="_blank"
                rel="noopener noreferrer"
                title="LinkedIn"
                aria-label="LinkedIn"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: '#94a3b8',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; e.currentTarget.style.color = '#94a3b8'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Clean Android APK Link */}
        <div style={{ marginTop: '14px' }}>
          <a
            href={`/fiatwallet.apk?v=${Date.now()}`}
            download="fiatwallet.apk"
            style={{
              width: '100%',
              padding: '9px 12px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '10px',
              color: '#cbd5e1',
              fontSize: '11.5px',
              fontWeight: '500',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxSizing: 'border-box',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download Android APK</span>
            </div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>↓</span>
          </a>
        </div>

        {/* Footer Actions */}
        <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          {isInternal ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
              <button
                type="button"
                onClick={() => { onClose(); onLock(); }}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  color: 'white',
                  fontSize: '12.5px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; }}
              >
                Lock Wallet
              </button>
              <button
                type="button"
                onClick={() => { onClose(); onLogout(); }}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: '10px',
                  color: '#f87171',
                  fontSize: '12.5px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.14)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'; }}
              >
                Log Out / Reset Wallet
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { onClose(); onLogout(); }}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '10px',
                color: '#f87171',
                fontSize: '12.5px',
                fontWeight: '600',
                cursor: 'pointer',
                marginBottom: '10px',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.14)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'; }}
            >
              {walletAddress ? 'Disconnect Wallet' : 'Exit Guest Mode'}
            </button>
          )}

          <div style={{ textAlign: 'center', fontSize: '10.5px', color: 'var(--text3, #64748b)' }}>
            Fiatwallet v2.4.0 • Non-custodial
          </div>
        </div>
      </div>
    </div>
  );
}
