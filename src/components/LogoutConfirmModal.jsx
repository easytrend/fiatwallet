import { useState } from 'react';

export default function LogoutConfirmModal({ isOpen, onClose, onConfirmLogout, onOpenBackup }) {
  const [confirmedBackup, setConfirmedBackup] = useState(false);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        background: 'rgba(5, 11, 24, 0.88)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: 'var(--ff, sans-serif)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #111e38 0%, #0a1628 100%)',
          border: '1px solid rgba(248, 113, 113, 0.35)',
          borderRadius: '20px',
          padding: '24px 20px',
          maxWidth: '420px',
          width: '100%',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8)',
          color: 'var(--text, #f1f5f9)',
          animation: 'modalSlideUp 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Warning Icon Header */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'rgba(248, 113, 113, 0.15)',
              border: '2px solid rgba(248, 113, 113, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto',
              color: '#f87171',
              fontSize: '24px',
              fontWeight: '900',
            }}
          >
            !
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#ffffff', margin: '0 0 6px 0' }}>
            Back Up Before Logging Out
          </h3>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, lineHeight: '1.5' }}>
            Logging out will remove your active wallet from this device.
          </p>
        </div>

        {/* Warning Box */}
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '12px',
            padding: '12px 14px',
            marginBottom: '16px',
            fontSize: '12px',
            color: '#fca5a5',
            lineHeight: '1.5',
          }}
        >
          • <strong>CRITICAL:</strong> Make sure you have already saved your <strong>12-word Secret Recovery Phrase</strong> or <strong>Private Key</strong>.<br />
          • If you log out without a backup, you will <strong>permanently lose access</strong> to your funds. No one can recover it for you.
        </div>

        {/* Option to View Backup First */}
        {onOpenBackup && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenBackup();
            }}
            style={{
              width: '100%',
              padding: '11px',
              background: 'rgba(34, 211, 238, 0.1)',
              border: '1px solid rgba(34, 211, 238, 0.3)',
              borderRadius: '12px',
              color: 'var(--cyan, #22d3ee)',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>View Recovery Phrase / Private Key</span>
            <span>→</span>
          </button>
        )}

        {/* Checkbox Confirmation */}
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#e2e8f0',
            lineHeight: '1.4',
            marginBottom: '20px',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={confirmedBackup}
            onChange={(e) => setConfirmedBackup(e.target.checked)}
            style={{
              marginTop: '2px',
              cursor: 'pointer',
              accentColor: 'var(--red, #f87171)',
              width: '16px',
              height: '16px',
            }}
          />
          <span>
            I have written down and securely backed up my seed phrase / private key.
          </span>
        </label>

        {/* Action Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '12px',
              color: '#94a3b8',
              fontWeight: '700',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!confirmedBackup}
            onClick={() => {
              onClose();
              onConfirmLogout();
            }}
            style={{
              background: confirmedBackup
                ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
                : 'rgba(239, 68, 68, 0.25)',
              border: 'none',
              borderRadius: '12px',
              padding: '12px',
              color: confirmedBackup ? '#ffffff' : 'rgba(255, 255, 255, 0.4)',
              fontWeight: '800',
              fontSize: '13px',
              cursor: confirmedBackup ? 'pointer' : 'not-allowed',
              boxShadow: confirmedBackup ? '0 4px 14px rgba(239, 68, 68, 0.4)' : 'none',
            }}
          >
            Log Out & Reset
          </button>
        </div>
      </div>
    </div>
  );
}
