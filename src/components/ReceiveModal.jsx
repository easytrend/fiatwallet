import { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  SUPPORTED_CHAINS,
  CHAIN_TOKENS,
  SOLANA_DESTINATIONS,
  getBridgeQuote,
  createBridgeDeposit,
  checkBridgeStatus,
  claimBridgeForward,
} from '../services/bridgeService';

export default function ReceiveModal({ address, onClose }) {
  // Chain selection: 'solana' (default) or other cross-chain options
  const [selectedChain, setSelectedChain] = useState('solana');

  // Default Solana QR state
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // Cross-Chain Bridge state
  const [selectedOriginToken, setSelectedOriginToken] = useState(null);
  const [selectedDestToken, setSelectedDestToken] = useState(SOLANA_DESTINATIONS[0]); // default USDT
  const [sendAmount, setSendAmount] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [quoteResult, setQuoteResult] = useState(null);

  // Active bridge deposit session
  const [bridgeDeposit, setBridgeDeposit] = useState(null);
  const [bridgeQrUrl, setBridgeQrUrl] = useState('');
  const [bridgeDepositCopied, setBridgeDepositCopied] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState('PENDING_DEPOSIT'); // PENDING_DEPOSIT | PROCESSING | FORWARDING | COMPLETED | FAILED
  const [forwardSig, setForwardSig] = useState(null);
  const [generatingDeposit, setGeneratingDeposit] = useState(false);

  const pollTimerRef = useRef(null);

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
      .then(url => setQrUrl(url))
      .catch(err => console.error('QR code generation error:', err));
  }, [address]);

  // When selectedChain changes, pick default token for that chain
  useEffect(() => {
    if (selectedChain !== 'solana') {
      const tokens = CHAIN_TOKENS[selectedChain] || [];
      setSelectedOriginToken(tokens[0] || null);
      setSendAmount(tokens[0]?.min || '10');
      setQuoteResult(null);
      setQuoteError('');
      setBridgeDeposit(null);
      setBridgeStatus('PENDING_DEPOSIT');
      setForwardSig(null);
    }
  }, [selectedChain]);

  // Auto-fetch dry-run quote when amount, originToken, or destToken changes
  useEffect(() => {
    if (selectedChain === 'solana' || !selectedOriginToken || !selectedDestToken) return;

    const parsed = parseFloat(sendAmount);
    if (!parsed || parsed <= 0) {
      setQuoteResult(null);
      setQuoteError('');
      return;
    }

    const timer = setTimeout(async () => {
      setQuoteLoading(true);
      setQuoteError('');
      try {
        const quote = await getBridgeQuote({
          originAsset: selectedOriginToken.assetId,
          destinationAsset: selectedDestToken.assetId,
          amountFloat: sendAmount,
          originDecimals: selectedOriginToken.decimals,
          destinationDecimals: selectedDestToken.decimals,
          destinationSymbol: selectedDestToken.symbol,
        });
        setQuoteResult(quote);
      } catch (err) {
        setQuoteError(err.message || 'Could not fetch quote');
        setQuoteResult(null);
      } finally {
        setQuoteLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [selectedChain, selectedOriginToken, selectedDestToken, sendAmount]);

  // Generate QR code for active bridge deposit address
  useEffect(() => {
    if (!bridgeDeposit?.depositAddress) return;
    QRCode.toDataURL(bridgeDeposit.depositAddress, {
      width: 240,
      margin: 2,
      color: {
        dark: '#0a1628',
        light: '#ffffff',
      },
    })
      .then(url => setBridgeQrUrl(url))
      .catch(err => console.error('Bridge QR error:', err));
  }, [bridgeDeposit?.depositAddress]);

  // Poll bridge status when deposit address is active
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
            if (forwardRes.signature) {
              setForwardSig(forwardRes.signature);
              setBridgeStatus('COMPLETED');
            }
          } catch (forwardErr) {
            console.error('Relayer forward error:', forwardErr);
            // If already forwarded or error, check signature
            if (forwardErr.message?.includes('already forwarded')) {
              setBridgeStatus('COMPLETED');
            }
          }
        } else if (status === 'FAILED' || status === 'REFUNDED') {
          setBridgeStatus('FAILED');
          clearInterval(pollTimerRef.current);
        }
      } catch (err) {
        console.warn('Status poll error:', err.message);
      }
    }, 3500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [bridgeDeposit?.depositAddress, bridgeStatus, address, selectedDestToken.symbol]);

  const handleCopySolana = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyBridgeDeposit = () => {
    if (!bridgeDeposit?.depositAddress) return;
    navigator.clipboard.writeText(bridgeDeposit.depositAddress);
    setBridgeDepositCopied(true);
    setTimeout(() => setBridgeDepositCopied(false), 2000);
  };

  const handleGenerateDeposit = async () => {
    if (!selectedOriginToken || !selectedDestToken || !sendAmount) return;
    setGeneratingDeposit(true);
    setQuoteError('');
    try {
      const deposit = await createBridgeDeposit({
        originAsset: selectedOriginToken.assetId,
        destinationAsset: selectedDestToken.assetId,
        amountFloat: sendAmount,
        originDecimals: selectedOriginToken.decimals,
        destinationSymbol: selectedDestToken.symbol,
        userAddress: address,
      });
      setBridgeDeposit(deposit);
      setBridgeStatus('PENDING_DEPOSIT');
    } catch (err) {
      setQuoteError(err.message || 'Failed to generate deposit address');
    } finally {
      setGeneratingDeposit(false);
    }
  };

  const availableOriginTokens = CHAIN_TOKENS[selectedChain] || [];
  const selectedChainObj = SUPPORTED_CHAINS.find(c => c.id === selectedChain) || SUPPORTED_CHAINS[0];

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
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '410px',
          maxHeight: '90vh',
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
          Receive Assets
        </h3>
        <p style={{ fontSize: '11px', color: 'var(--text2, rgba(240, 246, 255, 0.6))', margin: '0 0 16px 0', textAlign: 'center' }}>
          Select source network or deposit directly on Solana
        </p>

        {/* Network Selector Dropdown */}
        <div style={{ marginBottom: '18px' }}>
          <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text2, rgba(240, 246, 255, 0.7))', display: 'block', marginBottom: '6px' }}>
            DEPOSIT NETWORK
          </label>
          <div style={{ position: 'relative' }}>
            <select
              value={selectedChain}
              onChange={e => setSelectedChain(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'rgba(10, 22, 40, 0.9)',
                border: selectedChain === 'solana' ? '1px solid rgba(163, 230, 53, 0.4)' : '1px solid rgba(34, 211, 238, 0.5)',
                borderRadius: '14px',
                color: 'white',
                fontSize: '13px',
                fontWeight: '700',
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                WebkitAppearance: 'none',
              }}
            >
              {SUPPORTED_CHAINS.map(chain => (
                <option key={chain.id} value={chain.id} style={{ background: '#0d1829', color: '#fff' }}>
                  {chain.icon} {chain.name} {chain.isDefault ? '(Default · Direct Deposit)' : '· Cross-Chain Bridge'}
                </option>
              ))}
            </select>
            <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: '11px', color: 'var(--text2)' }}>
              ▼
            </span>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            CASE A: DEFAULT SOLANA VIEW (Exact original experience)
           ══════════════════════════════════════════════════════════════════════ */}
        {selectedChain === 'solana' && (
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                display: 'inline-block',
                padding: '12px',
                background: '#ffffff',
                borderRadius: '16px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                marginBottom: '16px',
              }}
            >
              {qrUrl ? (
                <img
                  src={qrUrl}
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
                background: 'rgba(10, 22, 40, 0.8)',
                border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
                borderRadius: '12px',
                padding: '10px 12px',
                marginBottom: '14px',
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
                padding: '13px',
                background: copied
                  ? 'rgba(163, 230, 53, 0.25)'
                  : 'linear-gradient(135deg, rgba(163, 230, 53, 0.18), rgba(163, 230, 53, 0.08))',
                border: `1px solid ${copied ? 'var(--lime, #a3e635)' : 'rgba(163, 230, 53, 0.4)'}`,
                borderRadius: '14px',
                color: 'var(--lime, #a3e635)',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                fontFamily: 'var(--ff)',
                marginBottom: '10px',
              }}
            >
              {copied ? '✓ Copied Solana Address' : 'Copy Solana Address'}
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
                marginTop: '14px',
                fontSize: '11px',
                color: 'var(--text3, rgba(240, 246, 255, 0.45))',
                lineHeight: '1.4',
              }}
            >
              Send only Solana network assets (SOL, USDT, USDC, SPL tokens) to this address.
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            CASE B: CROSS-CHAIN BRIDGE VIEW (NEAR Intents + Aurora Engine)
           ══════════════════════════════════════════════════════════════════════ */}
        {selectedChain !== 'solana' && (
          <div>
            {!bridgeDeposit ? (
              /* Phase 1: Bridge Setup & Quote Form */
              <div>
                {/* Token selectors row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                  {/* Origin Token */}
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text2, rgba(240, 246, 255, 0.7))', display: 'block', marginBottom: '4px' }}>
                      SEND FROM {selectedChainObj.badge}
                    </label>
                    <select
                      value={selectedOriginToken?.symbol || ''}
                      onChange={e => {
                        const tok = availableOriginTokens.find(t => t.symbol === e.target.value);
                        setSelectedOriginToken(tok || null);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: 'rgba(10, 22, 40, 0.9)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '12px',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: '700',
                      }}
                    >
                      {availableOriginTokens.map(tok => (
                        <option key={tok.symbol} value={tok.symbol} style={{ background: '#0d1829' }}>
                          {tok.symbol}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Destination Token on Solana */}
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text2, rgba(240, 246, 255, 0.7))', display: 'block', marginBottom: '4px' }}>
                      RECEIVE ON SOLANA
                    </label>
                    <select
                      value={selectedDestToken?.symbol || ''}
                      onChange={e => {
                        const tok = SOLANA_DESTINATIONS.find(t => t.symbol === e.target.value);
                        setSelectedDestToken(tok || SOLANA_DESTINATIONS[0]);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: 'rgba(10, 22, 40, 0.9)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '12px',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: '700',
                      }}
                    >
                      {SOLANA_DESTINATIONS.map(tok => (
                        <option key={tok.symbol} value={tok.symbol} style={{ background: '#0d1829' }}>
                          {tok.symbol}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Amount to Send */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text2, rgba(240, 246, 255, 0.7))' }}>
                      AMOUNT TO DEPOSIT
                    </label>
                    <span style={{ fontSize: '11px', color: 'var(--text3, rgba(240, 246, 255, 0.5))' }}>
                      Min: {selectedOriginToken?.min} {selectedOriginToken?.symbol}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="any"
                    value={sendAmount}
                    onChange={e => setSendAmount(e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '12px 14px',
                      background: 'rgba(10, 22, 40, 0.9)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '12px',
                      color: 'white',
                      fontSize: '15px',
                      fontWeight: '700',
                      outline: 'none',
                      fontFamily: 'var(--mono, monospace)',
                    }}
                  />
                </div>

                {/* Quote Breakdown Card */}
                <div
                  style={{
                    background: 'rgba(10, 22, 40, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    marginBottom: '16px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text2, rgba(240,246,255,0.6))' }}>Estimated Output:</span>
                    <span style={{ fontWeight: '700', color: '#fff' }}>
                      {quoteLoading ? 'Calculating...' : (quoteResult ? `~${quoteResult.grossOut} ${selectedDestToken.symbol}` : '—')}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text2, rgba(240,246,255,0.6))' }}>Protocol Fee (0.4%):</span>
                    <span style={{ fontWeight: '600', color: 'var(--cyan, #22d3ee)' }}>
                      {quoteResult ? `-${quoteResult.protocolFee} ${selectedDestToken.symbol}` : '0.4% ($0.10 min)'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text2, rgba(240,246,255,0.6))' }}>Est. Arrival Time:</span>
                    <span style={{ color: 'var(--lime, #a3e635)', fontWeight: '600' }}>
                      {quoteResult ? `~${quoteResult.timeEstimate}s (NEAR Intent)` : '~20s'}
                    </span>
                  </div>

                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ fontWeight: '700', color: '#fff' }}>You Receive:</span>
                    <span style={{ fontWeight: '800', color: 'var(--lime, #a3e635)' }}>
                      {quoteResult ? `~${quoteResult.netReceived} ${selectedDestToken.symbol}` : '—'}
                    </span>
                  </div>
                </div>

                {quoteError && (
                  <div style={{ color: '#ef4444', fontSize: '11px', marginBottom: '12px', textAlign: 'center' }}>
                    {quoteError}
                  </div>
                )}

                {/* Generate Address Button */}
                <button
                  onClick={handleGenerateDeposit}
                  disabled={generatingDeposit || !quoteResult || quoteLoading}
                  style={{
                    width: '100%',
                    padding: '14px',
                    background: generatingDeposit || !quoteResult
                      ? 'rgba(255,255,255,0.08)'
                      : 'linear-gradient(135deg, rgba(34, 211, 238, 0.25), rgba(34, 211, 238, 0.1))',
                    border: `1px solid ${generatingDeposit || !quoteResult ? 'rgba(255,255,255,0.1)' : 'rgba(34, 211, 238, 0.5)'}`,
                    borderRadius: '14px',
                    color: generatingDeposit || !quoteResult ? 'rgba(255,255,255,0.4)' : 'var(--cyan, #22d3ee)',
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: generatingDeposit || !quoteResult ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--ff)',
                    transition: 'all 0.2s',
                  }}
                >
                  {generatingDeposit ? 'Generating Deposit Address...' : `Bridge ${selectedOriginToken?.symbol || ''} → ${selectedDestToken?.symbol || ''}`}
                </button>
              </div>
            ) : (
              /* Phase 2: Live Deposit & Status Screen */
              <div style={{ textAlign: 'center' }}>
                {/* QR Code */}
                <div
                  style={{
                    display: 'inline-block',
                    padding: '12px',
                    background: '#ffffff',
                    borderRadius: '16px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                    marginBottom: '14px',
                  }}
                >
                  {bridgeQrUrl ? (
                    <img
                      src={bridgeQrUrl}
                      alt="Cross-Chain Deposit QR"
                      style={{ width: '180px', height: '180px', display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: '180px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: '12px' }}>
                      Generating Bridge QR...
                    </div>
                  )}
                </div>

                {/* Instruction */}
                <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' }}>
                  Send <strong>{sendAmount} {selectedOriginToken?.symbol}</strong> on <strong>{selectedChainObj.name}</strong> to:
                </div>

                {/* Deposit Address Box */}
                <div
                  style={{
                    background: 'rgba(10, 22, 40, 0.9)',
                    border: '1px solid rgba(34, 211, 238, 0.3)',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    marginBottom: '12px',
                    wordBreak: 'break-all',
                    fontFamily: 'var(--mono, monospace)',
                    fontSize: '11px',
                    color: 'var(--cyan, #22d3ee)',
                    lineHeight: '1.4',
                    userSelect: 'all',
                  }}
                >
                  {bridgeDeposit.depositAddress}
                </div>

                {/* Copy Button */}
                <button
                  onClick={handleCopyBridgeDeposit}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: bridgeDepositCopied
                      ? 'rgba(34, 211, 238, 0.3)'
                      : 'rgba(34, 211, 238, 0.12)',
                    border: '1px solid rgba(34, 211, 238, 0.4)',
                    borderRadius: '12px',
                    color: 'var(--cyan, #22d3ee)',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    fontFamily: 'var(--ff)',
                    marginBottom: '14px',
                  }}
                >
                  {bridgeDepositCopied ? '✓ Copied Deposit Address' : `Copy ${selectedChainObj.name} Address`}
                </button>

                {/* Live Status Tracker */}
                <div
                  style={{
                    background: 'rgba(10, 22, 40, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    marginBottom: '14px',
                    textAlign: 'left',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ fontWeight: '700', marginBottom: '8px', color: '#fff', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Bridge Progress</span>
                    <span style={{
                      color: bridgeStatus === 'COMPLETED' ? 'var(--lime, #a3e635)' : (bridgeStatus === 'FAILED' ? '#ef4444' : 'var(--cyan, #22d3ee)')
                    }}>
                      {bridgeStatus === 'PENDING_DEPOSIT' && '• Waiting for Deposit'}
                      {bridgeStatus === 'PROCESSING' && '• Solvers Executing (~15s)'}
                      {bridgeStatus === 'FORWARDING' && '• Relaying to Your Wallet'}
                      {bridgeStatus === 'COMPLETED' && '✓ Completed!'}
                      {bridgeStatus === 'FAILED' && '✕ Refunded / Expired'}
                    </span>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text2, rgba(240,246,255,0.6))', lineHeight: '1.4' }}>
                    {bridgeStatus === 'PENDING_DEPOSIT' && 'Once your deposit is confirmed on the source network, solvers will automatically route your funds.'}
                    {bridgeStatus === 'PROCESSING' && 'Solvers have detected your deposit and are settling the transaction across chains.'}
                    {bridgeStatus === 'FORWARDING' && 'Funds received by relayer. Applying 0.4% protocol fee and transferring to your Solana wallet.'}
                    {bridgeStatus === 'COMPLETED' && (
                      <span style={{ color: 'var(--lime, #a3e635)' }}>
                        Success! Net ~{bridgeDeposit.netReceived} {selectedDestToken.symbol} has been deposited into your Solana wallet.
                      </span>
                    )}
                  </div>

                  {forwardSig && (
                    <div style={{ marginTop: '8px' }}>
                      <a
                        href={`https://solscan.io/tx/${forwardSig}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--cyan, #22d3ee)', textDecoration: 'none', fontSize: '11px' }}
                      >
                        View Solana Payout Transaction →
                      </a>
                    </div>
                  )}
                </div>

                {/* Back / Reset Button */}
                <button
                  onClick={() => {
                    setBridgeDeposit(null);
                    setBridgeStatus('PENDING_DEPOSIT');
                    setForwardSig(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text2, rgba(240, 246, 255, 0.6))',
                    fontSize: '12px',
                    cursor: 'pointer',
                    padding: '6px',
                  }}
                >
                  ← Start another bridge transaction
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
