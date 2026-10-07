import { useState } from 'react';

/**
 * NativeWalletApprovalModal
 *
 * Appears whenever an imported (self-custodial) wallet is requested to sign or send a transaction.
 * Gives a breakdown of the transaction (type, amounts, recipient, network fee, and gas).
 * Allows the user to explicitly Approve or Reject before private keys sign on-chain.
 */
export default function NativeWalletApprovalModal({
  isOpen,
  request,
  walletAddress,
  solBalance,
  onApprove,
  onReject,
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !request) return null;

  const { meta, breakdown } = request;
  const shortAddr = walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-6)}` : '';

  const handleCopyAddr = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const action = meta?.action || breakdown?.actionType || 'Transaction';
  const amount = meta?.amount || breakdown?.amount;
  const symbol = meta?.symbol || breakdown?.symbol || 'SOL';
  const recipient = meta?.recipient || breakdown?.recipient;
  const route = meta?.route || breakdown?.route;
  const expectedOutput = meta?.expectedOutput;
  const recipientsCount = meta?.recipientsCount;
  const fiatAmount = meta?.fiatAmount;
  const fiatSymbol = meta?.fiatSymbol || '$';

  const isLowBalance = (solBalance || 0) < 0.003;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(5, 11, 24, 0.90)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2147483647, // Always above any modal, card, or explorer view
      padding: '16px',
      fontFamily: 'var(--ff, sans-serif)',
      color: 'var(--text, #f0f6ff)',
      boxSizing: 'border-box',
      animation: 'fadeIn 0.2s ease',
    }}>
      <div style={{
        background: 'linear-gradient(180deg, #111e38 0%, #0a1628 100%)',
        border: '1px solid rgba(163, 230, 53, 0.35)',
        borderRadius: '22px',
        padding: '26px 22px 22px 22px',
        maxWidth: '410px',
        width: '100%',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)',
        boxSizing: 'border-box',
        animation: 'scaleUp 0.2s ease-out',
      }}>
        {/* Header with Self-Custodial Badge */}
        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: 'rgba(163, 230, 53, 0.15)',
            border: '1px solid var(--lime, #a3e635)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto',
            fontSize: '18px',
            fontWeight: '800',
            color: 'var(--lime, #a3e635)',
          }}>
            FW
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'white', margin: '0 0 4px 0', letterSpacing: '-0.01em' }}>
            Approve Transaction
          </h3>
          <div style={{ fontSize: '11px', color: 'var(--lime, #a3e635)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Self-Custodial Wallet • Solana Mainnet
          </div>
        </div>

        {/* Account & Gas Overview */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          padding: '12px 14px',
          marginBottom: '14px',
          fontSize: '12px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ color: 'var(--text3, rgba(240, 246, 255, 0.5))' }}>Fee Payer:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontFamily: 'var(--mono, monospace)', color: 'white', fontWeight: '700' }}>
                {shortAddr}
              </span>
              <button
                type="button"
                onClick={handleCopyAddr}
                style={{
                  background: 'none',
                  border: 'none',
                  color: copied ? 'var(--lime)' : 'var(--cyan)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  padding: 0,
                  fontWeight: '600',
                }}
              >
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ color: 'var(--text3, rgba(240, 246, 255, 0.5))' }}>Estimated Network Fee:</span>
            <span style={{ color: 'var(--cyan, #22d3ee)', fontWeight: '700', fontFamily: 'var(--mono, monospace)' }}>
              ~0.000005 SOL
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text3, rgba(240, 246, 255, 0.5))' }}>Wallet Balance:</span>
            <span style={{ color: isLowBalance ? '#f87171' : 'white', fontWeight: '700', fontFamily: 'var(--mono, monospace)' }}>
              {solBalance != null ? Number(solBalance).toFixed(4) : '0.0000'} SOL
            </span>
          </div>
        </div>

        {/* Transaction Breakdown Card */}
        <div style={{
          background: 'linear-gradient(180deg, rgba(163, 230, 53, 0.06) 0%, rgba(17, 30, 56, 0.6) 100%)',
          border: '1px solid rgba(163, 230, 53, 0.22)',
          borderRadius: '16px',
          padding: '16px',
          marginBottom: '16px',
        }}>
          <div style={{
            fontSize: '11px',
            color: 'var(--text3)',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px',
          }}>
            {action} Breakdown
          </div>

          {/* Action Specific Display */}
          {action === 'Swap' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Selling:</span>
                <span style={{ fontSize: '15px', fontWeight: '800', color: 'white', fontFamily: 'var(--mono)' }}>
                  {amount} {symbol}
                </span>
              </div>
              {expectedOutput && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Receiving (Est.):</span>
                  <span style={{ fontSize: '15px', fontWeight: '800', color: 'var(--lime, #a3e635)', fontFamily: 'var(--mono)' }}>
                    {expectedOutput}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text3)' }}>DEX Aggregator:</span>
                <span style={{ fontSize: '12px', color: 'white', fontWeight: '600' }}>
                  {route || 'Jupiter DEX V6'}
                </span>
              </div>
            </div>
          ) : action === 'Bulk Send' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Total Sending:</span>
                <span style={{ fontSize: '15px', fontWeight: '800', color: 'white', fontFamily: 'var(--mono)' }}>
                  {amount} {symbol}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Destinations:</span>
                <span style={{ fontSize: '12px', color: 'var(--lime, #a3e635)', fontWeight: '700' }}>
                  {recipientsCount ? `${recipientsCount} Recipients` : 'Multiple addresses'}
                </span>
              </div>
            </div>
          ) : (
            <div>
              {amount && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text2)' }}>
                    {action === 'Offramp Payout' ? 'Payout Amount:' : 'Transfer Amount:'}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: '800', color: 'white', fontFamily: 'var(--mono)' }}>
                    {amount} {symbol}
                  </span>
                </div>
              )}
              {fiatAmount && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
                    {action === 'Offramp Payout' ? 'Bank Settlement:' : 'Fiat Valuation:'}
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--lime)', fontWeight: '700' }}>
                    {fiatSymbol}{fiatAmount}
                  </span>
                </div>
              )}
              {recipient && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
                    {action === 'Offramp Payout' ? 'Bank Account / Tag:' : 'Recipient:'}
                  </span>
                  <span style={{ fontSize: '12px', color: 'white', fontFamily: 'var(--mono)', fontWeight: '600' }}>
                    {recipient.length > 20 && !recipient.includes('•') ? `${recipient.slice(0, 8)}...${recipient.slice(-6)}` : recipient}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Low balance warning */}
        {isLowBalance && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            padding: '8px 12px',
            color: '#f87171',
            fontSize: '11px',
            marginBottom: '14px',
            lineHeight: '1.4',
          }}>
            • Warning: Low SOL balance ({Number(solBalance || 0).toFixed(4)} SOL). You need SOL for gas and account creation.
          </div>
        )}

        {/* Security Notice */}
        <div style={{
          fontSize: '11px',
          color: 'var(--text3, rgba(240, 246, 255, 0.5))',
          textAlign: 'center',
          marginBottom: '16px',
          lineHeight: '1.4',
        }}>
          ✓ Non-Custodial: You have full control. Review the breakdown above before approving.
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '10px' }}>
          <button
            type="button"
            onClick={onReject}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.15))',
              borderRadius: '12px',
              padding: '12px',
              color: 'var(--text2, #94a3b8)',
              fontWeight: '700',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            Reject
          </button>

          <button
            type="button"
            onClick={onApprove}
            style={{
              background: 'var(--lime, #a3e635)',
              border: 'none',
              borderRadius: '12px',
              padding: '12px',
              color: '#0a1628',
              fontWeight: '800',
              fontSize: '14px',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(163, 230, 53, 0.3)',
              transition: 'transform 0.15s',
            }}
          >
            Approve &amp; Sign
          </button>
        </div>
      </div>
    </div>
  );
}
