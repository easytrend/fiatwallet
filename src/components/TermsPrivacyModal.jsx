export default function TermsPrivacyModal({ onClose }) {
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
          maxWidth: '460px',
          background: 'var(--card, #111e38)',
          border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
          borderRadius: '24px',
          padding: '24px 22px',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.6)',
          fontFamily: 'var(--ff, sans-serif)',
          color: 'var(--text, #f0f6ff)',
          position: 'relative',
          maxHeight: '85vh',
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

        <h3 style={{ fontSize: '18px', fontWeight: '800', margin: '0 0 16px 0', color: 'white' }}>
          Terms of Service &amp; Privacy Policy
        </h3>

        <div style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--text2, rgba(240, 246, 255, 0.7))', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'white', margin: '0 0 6px 0' }}>
              1. Non-Custodial Architecture
            </h4>
            <p style={{ margin: 0 }}>
              Fiatwallet is a purely decentralized, non-custodial wallet application. Your cryptographic keys, seed phrases, and credentials never leave your browser or device unencrypted. You retain sole responsibility for securing your seed phrase and PIN.
            </p>
          </div>

          <div>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'white', margin: '0 0 6px 0' }}>
              2. Peer-to-Peer &amp; Fiat Settlement
            </h4>
            <p style={{ margin: 0 }}>
              Crypto-to-fiat and fiat-to-crypto exchanges are performed peer-to-peer via decentralized escrow protocols and licensed payment rails. Bank account payouts are processed directly into the user-provided bank details.
            </p>
          </div>

          <div>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'white', margin: '0 0 6px 0' }}>
              3. Privacy &amp; Data Protection
            </h4>
            <p style={{ margin: 0 }}>
              We do not track your IP address, store private keys, or sell user telemetry. All sensitive wallet operations run client-side via the Web Cryptography standard (AES-256-GCM / PBKDF2).
            </p>
          </div>

          <div>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'white', margin: '0 0 6px 0' }}>
              4. Disclaimer of Warranty
            </h4>
            <p style={{ margin: 0 }}>
              Blockchain transactions are irreversible. Fiatwallet is provided on an &quot;as-is&quot; basis without warranty of any kind. Always double-check recipient addresses and transaction fees before confirming.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '14px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid var(--border2)',
            borderRadius: '14px',
            color: 'white',
            fontSize: '14px',
            fontWeight: '700',
            cursor: 'pointer',
            marginTop: '22px',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
