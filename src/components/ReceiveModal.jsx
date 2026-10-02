import { useState, useEffect } from 'react';
import QRCode from 'qrcode';

export default function ReceiveModal({ address, onClose }) {
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address) return;
    QRCode.toDataURL(address, {
      width: 240,
      margin: 2,
      color: {
        dark: '#0a1628',
        light: '#ffffff',
      },
    })
      .then(url => setQrUrl(url))
      .catch(err => console.error('QR code generation error:', err));
  }, [address]);

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shortAddr = address ? `${address.slice(0, 8)}...${address.slice(-8)}` : '';

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
          maxWidth: '380px',
          background: 'var(--card, #111e38)',
          border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
          borderRadius: '24px',
          padding: '24px 20px',
          textAlign: 'center',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.6)',
          fontFamily: 'var(--ff, sans-serif)',
          color: 'var(--text, #f0f6ff)',
          position: 'relative',
        }}
      >
        {/* Close Button */}
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
          Receive Assets
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text2, rgba(240, 246, 255, 0.6))', margin: '0 0 20px 0' }}>
          Solana Mainnet (SOL, USDC, USDT &amp; SPL tokens)
        </p>

        {/* QR Code Container */}
        <div
          style={{
            display: 'inline-block',
            padding: '12px',
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
            marginBottom: '18px',
          }}
        >
          {qrUrl ? (
            <img
              src={qrUrl}
              alt="Deposit QR"
              style={{ width: '190px', height: '190px', display: 'block' }}
            />
          ) : (
            <div style={{ width: '190px', height: '190px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: '12px' }}>
              Generating QR...
            </div>
          )}
        </div>

        {/* Formatted Address Box */}
        <div
          style={{
            background: 'rgba(10, 22, 40, 0.8)',
            border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
            borderRadius: '12px',
            padding: '12px 14px',
            marginBottom: '16px',
            wordBreak: 'break-all',
            fontFamily: 'var(--mono, monospace)',
            fontSize: '11px',
            color: 'var(--text, #f0f6ff)',
            lineHeight: '1.4',
            userSelect: 'all',
          }}
        >
          {address}
        </div>

        {/* Copy Button */}
        <button
          onClick={handleCopy}
          style={{
            width: '100%',
            padding: '14px',
            background: copied
              ? 'rgba(163, 230, 53, 0.25)'
              : 'linear-gradient(135deg, rgba(163, 230, 53, 0.18), rgba(163, 230, 53, 0.08))',
            border: `1px solid ${copied ? 'var(--lime, #a3e635)' : 'rgba(163, 230, 53, 0.4)'}`,
            borderRadius: '14px',
            color: 'var(--lime, #a3e635)',
            fontSize: '14px',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontFamily: 'var(--ff)',
            marginBottom: '12px',
          }}
        >
          {copied ? '✓ Copied to Clipboard' : 'Copy Solana Address'}
        </button>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '12px' }}>
          <a
            href={`https://solscan.io/account/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--cyan, #22d3ee)', textDecoration: 'none' }}
          >
            View on Solscan →
          </a>
        </div>

        <div
          style={{
            marginTop: '16px',
            fontSize: '11px',
            color: 'var(--text3, rgba(240, 246, 255, 0.4))',
            lineHeight: '1.4',
          }}
        >
          Send only Solana network assets to this address. Any other network tokens may be lost permanently.
        </div>
      </div>
    </div>
  );
}
