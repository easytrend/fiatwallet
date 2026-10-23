import { useState, useEffect } from 'react';

export default function DAppApprovalModal({ effectivePublicKey, solBalance, effectiveSignTransaction }) {
  const [activeRequest, setActiveRequest] = useState(null);

  useEffect(() => {
    // Standard Injected Provider Approval Request
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

    // Native Android Bridge Requests (from MainActivity.java)
    const handleNativeConnect = (e) => {
      if (e.detail) {
        setActiveRequest({
          reqId: e.detail.reqId,
          type: 'connect',
          data: {
            origin: e.detail.origin || 'Solana dApp',
            title: e.detail.title || 'dApp Connection',
          },
          isNative: true,
          resolve: () => {
            const pubKey = effectivePublicKey ? effectivePublicKey.toBase58() : '';
            if (window.FiatWalletBridge && typeof window.FiatWalletBridge.approveConnect === 'function') {
              try { window.FiatWalletBridge.approveConnect(e.detail.reqId, pubKey); } catch {}
            }
            if (window.fiatwallet?._onConnectApproved) {
              window.fiatwallet._onConnectApproved(e.detail.reqId, pubKey);
            }
          },
          reject: () => {
            if (window.FiatWalletBridge && typeof window.FiatWalletBridge.rejectConnect === 'function') {
              try { window.FiatWalletBridge.rejectConnect(e.detail.reqId); } catch {}
            }
            if (window.fiatwallet?._onConnectRejected) {
              window.fiatwallet._onConnectRejected(e.detail.reqId);
            }
          }
        });
      }
    };

    const handleNativeSign = async (e) => {
      if (e.detail) {
        setActiveRequest({
          reqId: e.detail.reqId,
          type: e.detail.type || 'signTransaction',
          data: {
            origin: 'Solana dApp (In-App)',
            title: 'Sign Transaction Request',
            txData: e.detail.txData,
          },
          isNative: true,
          resolve: async () => {
            let resultData = e.detail.txData;
            if (typeof effectiveSignTransaction === 'function' && e.detail.txData) {
              try {
                const { Transaction, VersionedTransaction } = await import('@solana/web3.js');
                const raw = Array.isArray(e.detail.txData) ? new Uint8Array(e.detail.txData) : e.detail.txData;
                let tx;
                try {
                  tx = Transaction.from(raw);
                } catch {
                  try {
                    tx = VersionedTransaction.deserialize(raw);
                  } catch {}
                }
                if (tx) {
                  const signed = await effectiveSignTransaction(tx);
                  resultData = Array.from(signed.serialize ? signed.serialize() : signed);
                }
              } catch (signErr) {
                console.warn('Signing error:', signErr);
              }
            }
            const txDataStr = JSON.stringify(resultData || {});
            if (window.FiatWalletBridge && typeof window.FiatWalletBridge.approveSign === 'function') {
              try { window.FiatWalletBridge.approveSign(e.detail.reqId, txDataStr); } catch {}
            }
            if (window.fiatwallet?._onSignApproved) {
              window.fiatwallet._onSignApproved(e.detail.reqId, resultData);
            }
          },
          reject: () => {
            if (window.FiatWalletBridge && typeof window.FiatWalletBridge.rejectSign === 'function') {
              try { window.FiatWalletBridge.rejectSign(e.detail.reqId); } catch {}
            }
            if (window.fiatwallet?._onSignRejected) {
              window.fiatwallet._onSignRejected(e.detail.reqId);
            }
          }
        });
      }
    };

    window.addEventListener('fiatwallet:approval-request', handleRequest);
    window.addEventListener('fiatwallet:approval-done', handleDone);
    window.addEventListener('fiatwallet:native-connect-request', handleNativeConnect);
    window.addEventListener('fiatwallet:native-sign-request', handleNativeSign);

    return () => {
      window.removeEventListener('fiatwallet:approval-request', handleRequest);
      window.removeEventListener('fiatwallet:approval-done', handleDone);
      window.removeEventListener('fiatwallet:native-connect-request', handleNativeConnect);
      window.removeEventListener('fiatwallet:native-sign-request', handleNativeSign);
    };
  }, [activeRequest, effectivePublicKey, effectiveSignTransaction]);

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
      background: 'rgba(5, 11, 24, 0.88)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2147483647, // Maximum z-index so it always appears above full-screen dApp view
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
