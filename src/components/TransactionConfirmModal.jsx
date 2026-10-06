import { useState } from 'react';

export default function TransactionConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Transaction',
  recipient,
  recipientLabel = 'Recipient',
  amount,
  symbol,
  fiatAmount,
  fiatSymbol = '₦',
  networkFee = '~0.000005 SOL',
  details = [],
  confirmButtonText = 'Approve & Send',
  isSubmitting = false,
}) {
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
      onClick={!isSubmitting ? onClose : undefined}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #111e38 0%, #0a1628 100%)',
          border: '1px solid rgba(163, 230, 53, 0.35)',
          borderRadius: '22px',
          padding: '24px 20px',
          maxWidth: '420px',
          width: '100%',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8)',
          color: 'var(--text, #f1f5f9)',
          animation: 'modalSlideUp 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(163, 230, 53, 0.12)',
              border: '1.5px solid var(--lime, #a3e635)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto',
              color: 'var(--lime, #a3e635)',
              fontSize: '20px',
              fontWeight: '800',
            }}
          >
            ✓
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#ffffff', margin: '0 0 6px 0' }}>
            {title}
          </h3>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
            Please review the details before broadcasting on Solana
          </p>
        </div>

        {/* Amount Display Card */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '16px',
            textAlign: 'center',
            marginBottom: '16px',
          }}
        >
          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Sending
          </div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#ffffff', fontFamily: 'var(--mono, monospace)', letterSpacing: '-0.02em' }}>
            {amount} <span style={{ color: 'var(--lime, #a3e635)', fontSize: '20px' }}>{symbol}</span>
          </div>
          {fiatAmount && (
            <div style={{ fontSize: '13px', color: 'var(--cyan, #22d3ee)', fontWeight: '600', marginTop: '4px' }}>
              ≈ {fiatSymbol}{fiatAmount}
            </div>
          )}
        </div>

        {/* Transaction Meta Details */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '14px',
            padding: '12px 14px',
            marginBottom: '20px',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {/* Recipient */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#94a3b8' }}>{recipientLabel}:</span>
            <span style={{ fontFamily: 'var(--mono, monospace)', color: 'white', fontWeight: '700', wordBreak: 'break-all', textAlign: 'right', maxWidth: '65%' }}>
              {recipient}
            </span>
          </div>

          {/* Additional details */}
          {details.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#94a3b8' }}>{item.label}:</span>
              <span style={{ color: item.color || 'white', fontWeight: '600', textAlign: 'right' }}>
                {item.value}
              </span>
            </div>
          ))}

          {/* Network Fee */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <span style={{ color: '#94a3b8' }}>Solana Network Gas:</span>
            <span style={{ color: 'var(--cyan, #22d3ee)', fontFamily: 'var(--mono, monospace)', fontWeight: '700' }}>
              {networkFee}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '12px',
              color: '#94a3b8',
              fontWeight: '700',
              fontSize: '13px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            style={{
              background: 'linear-gradient(135deg, var(--lime, #a3e635) 0%, #65a30d 100%)',
              border: 'none',
              borderRadius: '12px',
              padding: '12px',
              color: '#090d16',
              fontWeight: '800',
              fontSize: '13px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(163, 230, 53, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            {isSubmitting ? 'Broadcasting...' : confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}
