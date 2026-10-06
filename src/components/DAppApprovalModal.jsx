import { useState, useEffect } from 'react';

export default function DAppApprovalModal({ effectivePublicKey, solBalance }) {
  const [activeRequest, setActiveRequest] = useState(null);

  useEffect(() => {
    const handleRequest = (e) => {
      if (e.detail) {
        setActiveRequest(e.detail);
      }
    };

    const handleDone = (e) => {
      if (activeRequest && e.detail?.reqId === activeRequest.reqId) {
        setActiveRequest(null);
      }
    };

    window.addEventListener('fiatwallet:approval-request', handleRequest);
    window.addEventListener('fiatwallet:approval-done', handleDone);

    return () => {
      window.removeEventListener('fiatwallet:approval-request', handleRequest);
      window.removeEventListener('fiatwallet:approval-done', handleDone);
    };
  }, [activeRequest]);

  if (!activeRequest) return null;

  const { type, data, resolve, reject } = activeRequest;
  const isConnect = type === 'connect';
  const origin = data?.origin || 'External Solana dApp';
  const title = data?.title || 'dApp Connection Request';
  const pubKeyStr = effectivePublicKey ? effectivePublicKey.toBase58() : 'Not Loaded';

  const handleApprove = () => {
    if (resolve) resolve(true);
    setActiveRequest(null);
  };

  const handleReject = () => {
    if (reject) reject(new Error('User rejected the request.'));
    setActiveRequest(null);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(5, 11, 24, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999999,
      padding: '16px',
      fontFamily: 'var(--ff, sans-serif)',
      color: 'var(--text, #f1f5f9)'
    }}>
      <div style={{
        background: 'linear-gradient(180deg, #111e38 0%, #0a1628 100%)',
        border: '1px solid rgba(163, 230, 53, 0.35)',
        borderRadius: '20px',
        padding: '24px 20px',
        maxWidth: '420px',
        width: '100%',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7)',
        animation: 'modalSlideUp 0.2s ease-out'
      }}>
        {/* Header */}
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
            color: 'var(--lime, #a3e635)'
          }}>
            FW
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'white', margin: '0 0 6px 0' }}>
            {isConnect ? 'Connect to FiatWallet' : 'Approve Transaction'}
          </h3>
          <div style={{ fontSize: '12px', color: 'var(--text2, #94a3b8)', wordBreak: 'break-all' }}>
            {origin}
          </div>
        </div>

        {/* Content Box */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          padding: '14px',
          marginBottom: '20px',
          fontSize: '12px'
        }}>
          {isConnect ? (
            <div>
              <p style={{ margin: '0 0 10px 0', color: 'var(--text2, #94a3b8)', lineHeight: '1.5' }}>
                This dApp is requesting permission to view your wallet address and propose transactions:
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text3, #64748b)' }}>Wallet Address:</span>
                <span style={{ fontFamily: 'var(--mono, monospace)', color: 'white', fontWeight: '700' }}>
                  {pubKeyStr.slice(0, 6)}...{pubKeyStr.slice(-6)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text3, #64748b)' }}>Network:</span>
                <span style={{ color: 'var(--lime, #a3e635)', fontWeight: '700' }}>Solana Mainnet</span>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ margin: '0 0 10px 0', color: 'var(--text2, #94a3b8)', lineHeight: '1.5' }}>
                This dApp requested a transaction signature on the Solana network:
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text3, #64748b)' }}>Fee Payer:</span>
                <span style={{ fontFamily: 'var(--mono, monospace)', color: 'white' }}>
                  {pubKeyStr.slice(0, 6)}...{pubKeyStr.slice(-6)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text3, #64748b)' }}>Estimated Gas:</span>
                <span style={{ color: 'var(--cyan, #22d3ee)', fontWeight: '700', fontFamily: 'var(--mono, monospace)' }}>
                  ~0.000005 SOL
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text3, #64748b)' }}>Your Balance:</span>
                <span style={{ color: (solBalance || 0) < 0.005 ? '#f87171' : 'white', fontWeight: '700' }}>
                  {solBalance != null ? Number(solBalance).toFixed(4) : '0.0000'} SOL
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Warning if balance is low for transactions */}
        {!isConnect && (solBalance || 0) < 0.005 && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            padding: '8px 12px',
            color: '#f87171',
            fontSize: '11px',
            marginBottom: '16px',
            lineHeight: '1.4'
          }}>
            Low SOL balance ({Number(solBalance || 0).toFixed(4)} SOL). You may need more SOL for transaction gas and token accounts.
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button
            type="button"
            onClick={handleReject}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.15))',
              borderRadius: '12px',
              padding: '12px',
              color: 'var(--text2, #94a3b8)',
              fontWeight: '700',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Reject
          </button>
          <button
            type="button"
            onClick={handleApprove}
            style={{
              background: 'linear-gradient(135deg, var(--lime, #a3e635), #65a30d)',
              border: 'none',
              borderRadius: '12px',
              padding: '12px',
              color: '#090d16',
              fontWeight: '800',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            {isConnect ? 'Connect' : 'Approve & Sign'}
          </button>
        </div>
      </div>
    </div>
  );
}
