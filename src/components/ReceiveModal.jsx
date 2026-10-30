import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  SUPPORTED_CHAINS,
  CHAIN_TOKENS,
  SOLANA_DESTINATIONS,
  getCachedBridgeDeposit,
  getOrCreateBridgeDeposit,
  markBridgeDepositCompleted,
  checkBridgeStatus,
  claimBridgeForward,
  isValidRefundAddress,
  getDefaultRefundAddress,
  isTreasuryRefundConfigured,
  getRealisticSettlementSpeed,
} from '../services/bridgeService';

export default function ReceiveModal({ address, onClose }) {
  // Selected network: 'solana' (default) or other cross-chain options
  const [selectedChainId, setSelectedChainId] = useState('solana');
  const [showChainMenu, setShowChainMenu] = useState(false);

  // Default Solana QR & copy state
  const [solanaQrUrl, setSolanaQrUrl] = useState('');
  const [solanaCopied, setSolanaCopied] = useState(false);

  // Cross-chain active token & destination
  const [selectedOriginToken, setSelectedOriginToken] = useState(null);
  const [selectedDestToken, setSelectedDestToken] = useState(SOLANA_DESTINATIONS[0]); // default USDT

  // Optional custom refund address
  const [customRefundInput, setCustomRefundInput] = useState('');
  const [appliedRefund, setAppliedRefund] = useState('');

  // Bridge deposit state (instantly loaded/generated & persisted)
  const [bridgeDeposit, setBridgeDeposit] = useState(null);
  const [bridgeQrUrl, setBridgeQrUrl] = useState('');
  const [bridgeCopied, setBridgeCopied] = useState(false);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeError, setBridgeError] = useState('');
  const [bridgeStatus, setBridgeStatus] = useState('PENDING_DEPOSIT'); // PENDING_DEPOSIT | PROCESSING | FORWARDING | COMPLETED | FAILED
  const [forwardSig, setForwardSig] = useState(null);

  const pollTimerRef = useRef(null);

  const selectedChain = SUPPORTED_CHAINS.find(c => c.id === selectedChainId) || SUPPORTED_CHAINS[0];
  const availableTokens = CHAIN_TOKENS[selectedChainId] || [];

  // Generate Solana QR Code on mount or address change
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
      .then(url => setSolanaQrUrl(url))
      .catch(err => console.error('Solana QR error:', err));
  }, [address]);

  // When switching chain, pick the first token for that chain immediately and clear refund overrides
  useEffect(() => {
    if (selectedChainId !== 'solana') {
      const tokens = CHAIN_TOKENS[selectedChainId] || [];
      const firstTok = tokens[0] || null;
      setSelectedOriginToken(firstTok);
      setCustomRefundInput('');
      setAppliedRefund('');

      // Check synchronous cache immediately for 0ms render
      if (firstTok && address) {
        const cached = getCachedBridgeDeposit(address, selectedChainId, firstTok.symbol, '', selectedDestToken.symbol);
        if (cached?.depositAddress) {
          setBridgeDeposit(cached);
          setBridgeError('');
          QRCode.toDataURL(cached.depositAddress, {
            width: 240,
            margin: 2,
            color: { dark: '#0a1628', light: '#ffffff' },
          }).then(url => setBridgeQrUrl(url)).catch(() => {});
        }
      }
    } else {
      setSelectedOriginToken(null);
      setBridgeDeposit(null);
      setBridgeQrUrl('');
      setBridgeError('');
      setCustomRefundInput('');
      setAppliedRefund('');
    }
  }, [selectedChainId, address, selectedDestToken.symbol]);

  // INSTANTLY get or create deposit address whenever origin token, chain, destToken, or appliedRefund changes
  useEffect(() => {
    if (selectedChainId === 'solana' || !selectedOriginToken || !address) return;

    let isCancelled = false;

    // Check if already in cache synchronously
    const cached = getCachedBridgeDeposit(address, selectedChainId, selectedOriginToken.symbol, appliedRefund, selectedDestToken.symbol);
    if (cached?.depositAddress) {
      setBridgeDeposit(cached);
      setBridgeError('');
      setBridgeLoading(false);
      QRCode.toDataURL(cached.depositAddress, {
        width: 240,
        margin: 2,
        color: { dark: '#0a1628', light: '#ffffff' },
      }).then(url => {
        if (!isCancelled) setBridgeQrUrl(url);
      }).catch(() => {});
      return;
    }

    // Not in cache yet: create deposit address immediately
    async function loadInstantDeposit(force = false) {
      setBridgeLoading(true);
      setBridgeError('');
      setBridgeStatus('PENDING_DEPOSIT');
      setForwardSig(null);

      try {
        const deposit = await getOrCreateBridgeDeposit({
          originAsset: selectedOriginToken.assetId,
          destinationAsset: selectedDestToken.assetId,
          originDecimals: selectedOriginToken.decimals,
          destinationSymbol: selectedDestToken.symbol,
          userAddress: address,
          chain: selectedChainId,
          tokenSymbol: selectedOriginToken.symbol,
          defaultAmount: selectedOriginToken.min || selectedOriginToken.defaultAmount || '5',
          forceNew: force,
          refundTo: appliedRefund,
        });

        if (!isCancelled && deposit?.depositAddress) {
          setBridgeDeposit(deposit);
          QRCode.toDataURL(deposit.depositAddress, {
            width: 240,
            margin: 2,
            color: { dark: '#0a1628', light: '#ffffff' },
          })
            .then(url => {
              if (!isCancelled) setBridgeQrUrl(url);
            })
            .catch(err => console.error('Deposit QR error:', err));
        }
      } catch (err) {
        if (!isCancelled) {
          setBridgeError(err.message || 'Failed to initialize bridge deposit address');
        }
      } finally {
        if (!isCancelled) setBridgeLoading(false);
      }
    }

    loadInstantDeposit();

    return () => {
      isCancelled = true;
    };
  }, [selectedChainId, selectedOriginToken, selectedDestToken, address, appliedRefund]);

  // Status Poller: monitors bridge deposit in real-time
  useEffect(() => {
    if (!bridgeDeposit?.depositAddress || bridgeStatus === 'COMPLETED' || bridgeStatus === 'FAILED') {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await checkBridgeStatus(bridgeDeposit.depositAddress);
        const status = (res?.status || '').toUpperCase();

        if (status === 'PROCESSING') {
          setBridgeStatus('PROCESSING');
        } else if (status === 'SUCCESS') {
          setBridgeStatus('FORWARDING');
          clearInterval(pollTimerRef.current);

          // Trigger relayer forward
          try {
            const forwardRes = await claimBridgeForward({
              depositAddress: bridgeDeposit.depositAddress,
              userAddress: address,
              destinationSymbol: selectedDestToken.symbol,
            });
            if (forwardRes?.signature) {
              setForwardSig(forwardRes.signature);
              setBridgeStatus('COMPLETED');
              markBridgeDepositCompleted(address, selectedChainId, selectedOriginToken?.symbol, appliedRefund, selectedDestToken.symbol);
            }
          } catch (forwardErr) {
            console.error('Relayer forward error:', forwardErr);
            if (forwardErr.message?.includes('already forwarded')) {
              setBridgeStatus('COMPLETED');
              markBridgeDepositCompleted(address, selectedChainId, selectedOriginToken?.symbol, appliedRefund, selectedDestToken.symbol);
            }
          }
        } else if (status === 'FAILED' || status === 'REFUNDED') {
          setBridgeStatus('FAILED');
          clearInterval(pollTimerRef.current);
        }
      } catch (err) {
        console.warn('Status poll warning:', err.message);
      }
    }, 3500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [bridgeDeposit?.depositAddress, bridgeStatus, address, selectedDestToken.symbol, selectedChainId, selectedOriginToken, appliedRefund]);

  const handleCopySolana = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setSolanaCopied(true);
    setTimeout(() => setSolanaCopied(false), 2000);
  };

  const handleCopyBridge = () => {
    if (!bridgeDeposit?.depositAddress) return;
    navigator.clipboard.writeText(bridgeDeposit.depositAddress);
    setBridgeCopied(true);
    setTimeout(() => setBridgeCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(5, 11, 20, 0.88)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => {
          e.stopPropagation();
          setShowChainMenu(false);
        }}
        style={{
          width: '100%',
          maxWidth: '390px',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: 'var(--card, #111e38)',
          border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
          borderRadius: '24px',
          padding: '24px 20px',
          boxShadow: '0 24px 50px rgba(0, 0, 0, 0.7)',
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

        {/* Modal Header */}
        <h3 style={{ fontSize: '18px', fontWeight: '800', margin: '0 0 4px 0', color: 'white', textAlign: 'center' }}>
          Receive Crypto
        </h3>
        <p style={{ fontSize: '11px', color: 'var(--text2, rgba(240, 246, 255, 0.6))', margin: '0 0 16px 0', textAlign: 'center' }}>
          Deposit directly on Solana or bridge from another chain
        </p>

        {/* ── Network Selector with Real Logos ── */}
        <div style={{ marginBottom: '14px', position: 'relative' }}>
          <label style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text2, rgba(240, 246, 255, 0.6))', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            SELECT DEPOSIT NETWORK
          </label>
          <div
            onClick={e => {
              e.stopPropagation();
              setShowChainMenu(v => !v);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'rgba(10, 22, 40, 0.95)',
              border: selectedChainId === 'solana' ? '1px solid rgba(163, 230, 53, 0.4)' : '1px solid rgba(34, 211, 238, 0.5)',
              borderRadius: '14px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img
                src={selectedChain.logo}
                alt={selectedChain.name}
                style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover' }}
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>
                {selectedChain.name}
              </span>
              <span style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '6px',
                background: selectedChainId === 'solana' ? 'rgba(163, 230, 53, 0.15)' : 'rgba(34, 211, 238, 0.15)',
                color: selectedChainId === 'solana' ? 'var(--lime, #a3e635)' : 'var(--cyan, #22d3ee)',
                fontWeight: '700',
              }}>
                {selectedChainId === 'solana' ? 'Direct' : 'Bridge'}
              </span>
            </div>
            <span style={{ fontSize: '10px', color: 'var(--text2)' }}>
              {showChainMenu ? '▲' : '▼'}
            </span>
          </div>

          {/* Custom Dropdown Menu with Logos */}
          {showChainMenu && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                right: 0,
                zIndex: 100,
                background: '#0d1829',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '14px',
                boxShadow: '0 12px 32px rgba(0,0,0,0.8)',
                overflow: 'hidden',
                maxHeight: '260px',
                overflowY: 'auto',
              }}
            >
              {SUPPORTED_CHAINS.map(chain => {
                const isSel = chain.id === selectedChainId;
                return (
                  <div
                    key={chain.id}
                    onClick={() => {
                      setSelectedChainId(chain.id);
                      setShowChainMenu(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: isSel ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                      cursor: 'pointer',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img
                        src={chain.logo}
                        alt={chain.name}
                        style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
                        onError={e => { e.currentTarget.style.display = 'none'; }}
                      />
                      <span style={{ fontSize: '13px', fontWeight: isSel ? '800' : '600', color: isSel ? '#fff' : 'var(--text2)' }}>
                        {chain.name}
                      </span>
                    </div>
                    {isSel && <span style={{ color: 'var(--lime, #a3e635)', fontSize: '12px', fontWeight: '800' }}>✓</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Token Selector Pills (When chain has multiple tokens, e.g. Base, Arbitrum, Ethereum, Tron) ── */}
        {selectedChainId !== 'solana' && availableTokens.length > 1 && (
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text2, rgba(240, 246, 255, 0.6))', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              CHOOSE ASSET ON {selectedChain.badge}
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {availableTokens.map(tok => {
                const isSelected = selectedOriginToken?.symbol === tok.symbol;
                return (
                  <button
                    key={tok.symbol}
                    type="button"
                    onClick={() => setSelectedOriginToken(tok)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '10px',
                      background: isSelected ? 'rgba(34, 211, 238, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      border: isSelected ? '1px solid var(--cyan, #22d3ee)' : '1px solid rgba(255, 255, 255, 0.08)',
                      color: isSelected ? '#fff' : 'var(--text2)',
                      fontSize: '12px',
                      fontWeight: isSelected ? '700' : '500',
                      cursor: 'pointer',
                    }}
                  >
                    <img
                      src={tok.logo}
                      alt={tok.symbol}
                      style={{ width: '16px', height: '16px', borderRadius: '50%', objectFit: 'cover' }}
                      onError={e => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span>{tok.symbol}</span>
                    <span style={{ fontSize: '10px', opacity: 0.65, fontWeight: '500' }}>
                      (Min: {tok.min})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            1. SOLANA VIEW (DEFAULT) — Instant QR & Address
           ══════════════════════════════════════════════════════════════════════ */}
        {selectedChainId === 'solana' && (
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                display: 'inline-block',
                padding: '12px',
                background: '#ffffff',
                borderRadius: '16px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                marginBottom: '14px',
              }}
            >
              {solanaQrUrl ? (
                <img
                  src={solanaQrUrl}
                  alt="Solana Deposit QR"
                  style={{ width: '180px', height: '180px', display: 'block' }}
                />
              ) : (
                <div style={{ width: '180px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: '12px' }}>
                  Generating QR...
                </div>
              )}
            </div>

            <div
              style={{
                background: 'rgba(10, 22, 40, 0.85)',
                border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
                borderRadius: '12px',
                padding: '10px 12px',
                marginBottom: '12px',
                wordBreak: 'break-all',
                fontFamily: 'var(--mono, monospace)',
                fontSize: '11px',
                color: 'var(--text, #f0f6ff)',
                lineHeight: '1.4',
                userSelect: 'all',
                textAlign: 'left',
              }}
            >
              {address}
            </div>

            <button
              onClick={handleCopySolana}
              style={{
                width: '100%',
                padding: '12px',
                background: solanaCopied
                  ? 'rgba(163, 230, 53, 0.25)'
                  : 'linear-gradient(135deg, rgba(163, 230, 53, 0.18), rgba(163, 230, 53, 0.08))',
                border: `1px solid ${solanaCopied ? 'var(--lime, #a3e635)' : 'rgba(163, 230, 53, 0.4)'}`,
                borderRadius: '12px',
                color: 'var(--lime, #a3e635)',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                fontFamily: 'var(--ff)',
                marginBottom: '8px',
              }}
            >
              {solanaCopied ? '✓ Copied Solana Address' : 'Copy Solana Address'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '12px', marginBottom: '10px' }}>
              <a
                href={`https://solscan.io/account/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--cyan, #22d3ee)', textDecoration: 'none' }}
              >
                View on Solscan →
              </a>
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text3, rgba(240, 246, 255, 0.45))', lineHeight: '1.4' }}>
              Send only Solana network assets (SOL, USDT, USDC, SPL tokens) to this address.
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            2. CROSS-CHAIN BRIDGE VIEW — INSTANT QR, NO EXTRA LAYER & PERSISTENT
           ══════════════════════════════════════════════════════════════════════ */}
        {selectedChainId !== 'solana' && (
          <div style={{ textAlign: 'center' }}>
            {bridgeLoading && !bridgeDeposit && (
              <div style={{ padding: '36px 0', color: 'var(--text2)' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>
                  Loading {selectedChain.name} Address...
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                  Generating instant deposit vault...
                </div>
              </div>
            )}

            {bridgeError && (
              <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', color: '#ef4444', fontSize: '12px', marginBottom: '12px', lineHeight: '1.4' }}>
                <div style={{ fontWeight: '700', marginBottom: '4px' }}>Notice</div>
                {bridgeError}
              </div>
            )}

            {bridgeDeposit && (
              <div>
                {/* Instant QR Code */}
                <div
                  style={{
                    display: 'inline-block',
                    padding: '12px',
                    background: '#ffffff',
                    borderRadius: '16px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                    marginBottom: '12px',
                  }}
                >
                  {bridgeQrUrl ? (
                    <img
                      src={bridgeQrUrl}
                      alt="Bridge Deposit QR"
                      style={{ width: '175px', height: '175px', display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: '175px', height: '175px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: '12px' }}>
                      Generating QR...
                    </div>
                  )}
                </div>

                {/* Instruction with Minimum Deposit highlighted */}
                <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '8px', lineHeight: '1.4' }}>
                  Send at least <strong style={{ color: '#fff' }}>{selectedOriginToken?.min} {selectedOriginToken?.symbol}</strong> on <strong>{selectedChain.name}</strong> to:
                </div>

                {/* Persistent Deposit Address */}
                <div
                  style={{
                    background: 'rgba(10, 22, 40, 0.9)',
                    border: '1px solid rgba(34, 211, 238, 0.35)',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    marginBottom: '10px',
                    wordBreak: 'break-all',
                    fontFamily: 'var(--mono, monospace)',
                    fontSize: '11px',
                    color: 'var(--cyan, #22d3ee)',
                    lineHeight: '1.4',
                    userSelect: 'all',
                    textAlign: 'left',
                  }}
                >
                  {bridgeDeposit.depositAddress}
                </div>

                {/* Copy Button */}
                <button
                  onClick={handleCopyBridge}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: bridgeCopied
                      ? 'rgba(34, 211, 238, 0.3)'
                      : 'linear-gradient(135deg, rgba(34, 211, 238, 0.22), rgba(34, 211, 238, 0.08))',
                    border: '1px solid rgba(34, 211, 238, 0.45)',
                    borderRadius: '12px',
                    color: 'var(--cyan, #22d3ee)',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    fontFamily: 'var(--ff)',
                    marginBottom: '12px',
                  }}
                >
                  {bridgeCopied ? `✓ Copied ${selectedChain.name} Address` : `Copy ${selectedChain.name} Address`}
                </button>

                {/* Transparent Protocol Breakdown & Destination */}
                {(() => {
                  const nearFeeVal = bridgeDeposit.nearFee || '0.27';
                  const minDepositVal = `${selectedOriginToken?.min || '2'} ${selectedOriginToken?.symbol || ''}`;
                  const settlementSpeed = getRealisticSettlementSpeed(selectedChainId, bridgeDeposit.timeEstimate);

                  return (
                    <div
                      style={{
                        background: 'rgba(10, 22, 40, 0.7)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '14px',
                        padding: '12px 14px',
                        marginBottom: '12px',
                        textAlign: 'left',
                        fontSize: '11px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ color: 'var(--text2)' }}>Receive on Solana as:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <img
                            src={selectedDestToken.logo}
                            alt={selectedDestToken.symbol}
                            style={{ width: '16px', height: '16px', borderRadius: '50%' }}
                          />
                          <span style={{ fontWeight: '700', color: '#fff' }}>{selectedDestToken.symbol}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ color: 'var(--text2)' }}>Min Deposit Required:</span>
                        <span style={{ color: '#fff', fontWeight: '700', fontFamily: 'var(--mono, monospace)' }}>
                          {minDepositVal}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div>
                          <span style={{ color: 'var(--text2)' }}>NEAR Network Fee:</span>
                          <span style={{ display: 'block', fontSize: '9.5px', color: 'var(--text3, rgba(240, 246, 255, 0.45))' }}>
                            Collected by NEAR Intents bridge
                          </span>
                        </div>
                        <span style={{ color: 'var(--text, #f0f6ff)', fontWeight: '700', fontFamily: 'var(--mono, monospace)' }}>
                          ~{nearFeeVal} {selectedDestToken.symbol}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ color: 'var(--text2)' }}>Protocol Fee:</span>
                        <span style={{ color: 'var(--cyan, #22d3ee)', fontWeight: '700' }}>0.4% ($0.10 min floor)</span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text2)' }}>Bridge Settlement Speed:</span>
                        <span style={{ color: 'var(--lime, #a3e635)', fontWeight: '700' }}>{settlementSpeed}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Refund Protection Section */}
                {(() => {
                  const defaultAddr = getDefaultRefundAddress(selectedChainId);
                  const isTreasuryConfigured = isTreasuryRefundConfigured(selectedChainId);
                  const shortenedDefault = defaultAddr && defaultAddr.length > 14
                    ? `${defaultAddr.slice(0, 6)}...${defaultAddr.slice(-4)}`
                    : defaultAddr;
                  const trimmedInput = customRefundInput.trim();
                  const isInputValid = trimmedInput ? isValidRefundAddress(trimmedInput, selectedChainId) : false;

                  return (
                    <div
                      style={{
                        background: 'rgba(10, 22, 40, 0.7)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '14px',
                        padding: '12px 14px',
                        marginBottom: '12px',
                        textAlign: 'left',
                        fontSize: '11px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          REFUND PROTECTION (IF SWAP FAILS)
                        </span>
                        <span style={{
                          fontSize: '9.5px',
                          padding: '2px 6px',
                          borderRadius: '6px',
                          background: appliedRefund ? 'rgba(34, 211, 238, 0.15)' : 'rgba(163, 230, 53, 0.15)',
                          color: appliedRefund ? 'var(--cyan, #22d3ee)' : 'var(--lime, #a3e635)',
                          fontWeight: '700',
                        }}>
                          {appliedRefund ? '✓ Custom Wallet Active' : (isTreasuryConfigured ? '✓ Treasury Protected' : '✓ Safe Fallback Active')}
                        </span>
                      </div>

                      <div style={{ color: 'var(--text3, rgba(240, 246, 255, 0.5))', fontSize: '10.5px', lineHeight: '1.4', marginBottom: '8px' }}>
                        {appliedRefund ? (
                          <span>
                            If bridge swap expires or fails, 100% of funds refund directly to <strong style={{ color: '#fff', wordBreak: 'break-all' }}>{appliedRefund}</strong>.
                          </span>
                        ) : (
                          <span>
                            If bridge swap expires or fails, funds are safely safeguarded by platform treasury recovery (<strong style={{ color: '#fff' }}>{shortenedDefault}</strong>). You can also set a personal refund wallet below.
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="text"
                          placeholder={`Enter your ${selectedChain.name} refund address (optional)`}
                          value={customRefundInput}
                          onChange={e => setCustomRefundInput(e.target.value)}
                          style={{
                            flex: 1,
                            background: 'rgba(5, 11, 20, 0.8)',
                            border: trimmedInput
                              ? (isInputValid ? '1px solid var(--lime, #a3e635)' : '1px solid #ef4444')
                              : '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            padding: '7px 10px',
                            color: '#fff',
                            fontSize: '11px',
                            fontFamily: 'var(--mono, monospace)',
                            outline: 'none',
                          }}
                        />
                        {trimmedInput && isInputValid && trimmedInput !== appliedRefund && (
                          <button
                            type="button"
                            onClick={() => setAppliedRefund(trimmedInput)}
                            style={{
                              padding: '0 12px',
                              background: 'rgba(34, 211, 238, 0.2)',
                              border: '1px solid var(--cyan, #22d3ee)',
                              borderRadius: '8px',
                              color: 'var(--cyan, #22d3ee)',
                              fontSize: '11px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Apply
                          </button>
                        )}
                        {appliedRefund && (
                          <button
                            type="button"
                            onClick={() => {
                              setAppliedRefund('');
                              setCustomRefundInput('');
                            }}
                            style={{
                              padding: '0 10px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              borderRadius: '8px',
                              color: 'var(--text2)',
                              fontSize: '11px',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                            title="Reset to Treasury Protection"
                          >
                            Reset
                          </button>
                        )}
                      </div>

                      {trimmedInput && !isInputValid && (
                        <div style={{ color: '#ef4444', fontSize: '9.5px', marginTop: '4px' }}>
                          ✕ Invalid {selectedChain.name} format ({selectedChainId === 'btc' ? 'bc1, 1, or 3' : selectedChainId === 'tron' ? 'starts with T (34 chars)' : 'starts with 0x (42 chars)'})
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Live Status Tracker */}
                <div
                  style={{
                    background: bridgeStatus === 'COMPLETED' ? 'rgba(163, 230, 53, 0.1)' : 'rgba(34, 211, 238, 0.08)',
                    border: `1px solid ${bridgeStatus === 'COMPLETED' ? 'rgba(163, 230, 53, 0.3)' : 'rgba(34, 211, 238, 0.2)'}`,
                    borderRadius: '10px',
                    padding: '8px 12px',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: bridgeStatus === 'COMPLETED' ? 'var(--lime, #a3e635)' : 'var(--cyan, #22d3ee)',
                    }} />
                    <span style={{ color: bridgeStatus === 'COMPLETED' ? 'var(--lime, #a3e635)' : '#fff', fontWeight: '600' }}>
                      {bridgeStatus === 'PENDING_DEPOSIT' && 'Waiting for deposit...'}
                      {bridgeStatus === 'PROCESSING' && 'Deposit detected! Bridging...'}
                      {bridgeStatus === 'FORWARDING' && 'Relaying to your wallet...'}
                      {bridgeStatus === 'COMPLETED' && '✓ Funds delivered to your wallet!'}
                      {bridgeStatus === 'FAILED' && '✕ Refunded / Expired'}
                    </span>
                  </div>

                  {forwardSig && (
                    <a
                      href={`https://solscan.io/tx/${forwardSig}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--cyan, #22d3ee)', textDecoration: 'none', fontWeight: '700' }}
                    >
                      View Tx →
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
