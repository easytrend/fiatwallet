import appLogo from '../assets/logo.png';

/**
 * NativeWalletApprovalModal
 *
 * Appears whenever an imported (self-custodial) wallet is requested to sign or send a transaction.
 * Gives an ultra-clean, minimal breakdown matching user requirements.
 * Allows the user to explicitly Approve or Reject before private keys sign on-chain.
 */

function formatTokenAmount(val) {
  if (val == null || val === '') return '0';
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return String(val);
  const rounded = parseFloat(num.toFixed(4));
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function formatExpectedOutput(out, defaultSym = '') {
  if (!out) return defaultSym ? `+0 ${defaultSym}` : '+0';
  let str = String(out).trim();
  str = str.replace(/^[~+]\s*/, '');
  const parts = str.split(' ');
  if (parts.length >= 2) {
    const num = parseFloat(parts[0]);
    if (!isNaN(num)) {
      const cleanNum = parseFloat(num.toFixed(4)).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      });
      return `+${cleanNum} ${parts.slice(1).join(' ')}`;
    }
  }
  const num = parseFloat(str);
  if (!isNaN(num)) {
    const cleanNum = parseFloat(num.toFixed(4)).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
    return defaultSym ? `+${cleanNum} ${defaultSym}` : `+${cleanNum}`;
  }
  return `+${str}`;
}

export default function NativeWalletApprovalModal({
  isOpen,
  request,
  walletAddress,
  solBalance,
  onApprove,
  onReject,
}) {
  if (!isOpen || !request) return null;

  const { meta, breakdown, transaction } = request;

  const RELAYER_PUBKEY = '5xh9BFXqCgpUxGbf3QzADNze945aNSiVG9EFNa8vvb3u';
  const txFeePayer = transaction?.feePayer?.toBase58?.() ||
    transaction?.message?.staticAccountKeys?.[0]?.toBase58?.() ||
    transaction?.message?.accountKeys?.[0]?.toBase58?.() ||
    breakdown?.feePayer;

  const action = meta?.action || breakdown?.actionType || 'Transaction';
  const isOfframp = action === 'Offramp Payout' || action === 'Offramp';
  const isSwap = action === 'Swap';

  const isGasless = Boolean(
    isOfframp ||
    isSwap ||
    meta?.gasless ||
    breakdown?.isGasless ||
    (txFeePayer && walletAddress && txFeePayer !== walletAddress) ||
    (txFeePayer === RELAYER_PUBKEY)
  );

  const rawAmount = meta?.amount ?? breakdown?.amount;
  const symbol = meta?.symbol || breakdown?.symbol || 'SOL';
  const recipient = meta?.recipient || breakdown?.recipient;
  const expectedOutput = meta?.expectedOutput;
  const outputSymbol = meta?.outputSymbol;
  const recipientsCount = meta?.recipientsCount;

  const cleanAmount = formatTokenAmount(rawAmount);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(5, 11, 24, 0.90)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2147483647,
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
        {/* Header with App Logo */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <img
            src={appLogo}
            alt="FiatWallet"
            style={{
              width: '48px',
              height: '48px',
              objectFit: 'contain',
              margin: '0 auto 12px auto',
              display: 'block',
            }}
          />
          <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'white', margin: '0 0 4px 0', letterSpacing: '-0.01em' }}>
            Approve Transaction
          </h3>
          <div style={{ fontSize: '11px', color: 'var(--lime, #a3e635)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Self-Custodial Wallet • Solana Mainnet
          </div>
        </div>

        {/* Clean Transaction Breakdown Card */}
        <div style={{
          background: 'linear-gradient(180deg, rgba(163, 230, 53, 0.06) 0%, rgba(17, 30, 56, 0.6) 100%)',
          border: '1px solid rgba(163, 230, 53, 0.22)',
          borderRadius: '16px',
          padding: '18px 16px',
          marginBottom: '18px',
        }}>
          {isOfframp ? (
            /* Offramp View: Net token leaving wallet & Network fee 0 SOL */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text2, #94a3b8)' }}>Sending:</span>
                <span style={{ fontSize: '18px', fontWeight: '800', color: '#ffffff', fontFamily: 'var(--mono, monospace)' }}>
                  -{cleanAmount} {symbol}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text3, rgba(240, 246, 255, 0.5))' }}>Network Fee:</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--lime, #a3e635)', fontFamily: 'var(--mono, monospace)' }}>
                  0 SOL
                </span>
              </div>
            </div>
          ) : isSwap ? (
            /* Swap View: +token amount to receive & -token amount to send & Network fee 0 SOL */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text2, #94a3b8)' }}>Receiving:</span>
                <span style={{ fontSize: '17px', fontWeight: '800', color: 'var(--lime, #a3e635)', fontFamily: 'var(--mono, monospace)' }}>
                  {formatExpectedOutput(expectedOutput, outputSymbol)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text2, #94a3b8)' }}>Sending:</span>
                <span style={{ fontSize: '17px', fontWeight: '800', color: '#ffffff', fontFamily: 'var(--mono, monospace)' }}>
                  -{cleanAmount} {symbol}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text3, rgba(240, 246, 255, 0.5))' }}>Network Fee:</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--cyan, #22d3ee)', fontFamily: 'var(--mono, monospace)' }}>
                  ~0.000005 SOL
                </span>
              </div>
            </div>
          ) : action === 'Bulk Send' ? (
            /* Bulk Send View */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text2, #94a3b8)' }}>Total Sending:</span>
                <span style={{ fontSize: '17px', fontWeight: '800', color: '#ffffff', fontFamily: 'var(--mono, monospace)' }}>
                  -{cleanAmount} {symbol}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text3, rgba(240, 246, 255, 0.5))' }}>Destinations:</span>
                <span style={{ fontSize: '13px', color: 'var(--lime, #a3e635)', fontWeight: '700' }}>
                  {recipientsCount ? `${recipientsCount} Recipients` : 'Multiple addresses'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text3, rgba(240, 246, 255, 0.5))' }}>Network Fee:</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: isGasless ? 'var(--lime, #a3e635)' : 'var(--cyan, #22d3ee)', fontFamily: 'var(--mono, monospace)' }}>
                  {isGasless ? '0 SOL' : '~0.000005 SOL'}
                </span>
              </div>
            </div>
          ) : (
            /* Standard Send / Other Action View */
            <div>
              {cleanAmount && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text2, #94a3b8)' }}>Sending:</span>
                  <span style={{ fontSize: '17px', fontWeight: '800', color: '#ffffff', fontFamily: 'var(--mono, monospace)' }}>
                    -{cleanAmount} {symbol}
                  </span>
                </div>
              )}
              {recipient && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text3, rgba(240, 246, 255, 0.5))' }}>Recipient:</span>
                  <span style={{ fontSize: '12px', color: '#ffffff', fontFamily: 'var(--mono, monospace)', fontWeight: '600' }}>
                    {recipient.length > 20 && !recipient.includes('•') ? `${recipient.slice(0, 6)}...${recipient.slice(-6)}` : recipient}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text3, rgba(240, 246, 255, 0.5))' }}>Network Fee:</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: isGasless ? 'var(--lime, #a3e635)' : 'var(--cyan, #22d3ee)', fontFamily: 'var(--mono, monospace)' }}>
                  {isGasless ? '0 SOL' : '~0.000005 SOL'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Security Notice */}
        <div style={{
          fontSize: '11px',
          color: 'var(--text3, rgba(240, 246, 255, 0.5))',
          textAlign: 'center',
          marginBottom: '18px',
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
