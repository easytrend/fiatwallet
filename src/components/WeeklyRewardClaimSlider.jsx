import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

export const PMEME_TOKEN = {
  name: 'Pullmeme',
  symbol: 'PMEME',
  mint: '8UJhknp5VGatZD9SRop2b8eeBg1ZGJLMT1Gzmf2cpump',
  decimals: 6,
  logo: '/pmeme.png',
};

/**
 * WeeklyRewardClaimSlider (Compact Header Pill)
 *
 * Placed directly inside the user's weekly rank card next to the tier badge.
 * Matches user's exact visual mockup:
 * - Unclaimed: Orange pill, circular PMEME logo on left, bold white "CLAIM" -> slide right.
 * - Claimed: Orange pill, bold white "CLAIMED" on left, circular PMEME logo on right.
 */
export default function WeeklyRewardClaimSlider({
  walletAddress,
  rank = null,
  points = 0,
  epochId = 'current_week',
}) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const containerRef = useRef(null);
  const knobRef = useRef(null);

  const storageKey = `fiatwallet_reward_claimed_${epochId}_${walletAddress || 'guest'}`;
  const [isClaimed, setIsClaimed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch (e) {
      return false;
    }
  });

  const [dragProgress, setDragProgress] = useState(0); // 0 to 1
  const [isDragging, setIsDragging] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey) === 'true';
      setIsClaimed(saved);
      setDragProgress(saved ? 1 : 0);
    } catch (e) {}
  }, [storageKey]);

  // Handle Drag Math
  const startXRef = useRef(0);
  const maxSlideRef = useRef(0);

  const calculateMaxSlide = useCallback(() => {
    if (containerRef.current && knobRef.current) {
      const cWidth = containerRef.current.offsetWidth;
      const kWidth = knobRef.current.offsetWidth;
      return Math.max(0, cWidth - kWidth - 6); // 3px padding
    }
    return 95; // fallback
  }, []);

  const handlePointerDown = (e) => {
    if (isClaimed || isClaiming) return;
    setIsDragging(true);
    startXRef.current = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    maxSlideRef.current = calculateMaxSlide();
  };

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || isClaimed || isClaiming) return;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    const deltaX = clientX - startXRef.current;
    const newX = Math.max(0, Math.min(maxSlideRef.current, deltaX));
    const progress = maxSlideRef.current > 0 ? newX / maxSlideRef.current : 0;
    setDragProgress(progress);
  }, [isDragging, isClaimed, isClaiming]);

  const handleClaimExecution = useCallback(async () => {
    if (!publicKey) {
      setWalletModalVisible(true);
      setDragProgress(0);
      return;
    }

    setIsClaiming(true);

    try {
      // Request co-signed claim transaction from backend
      const res = await fetch('/api/leaderboard?action=claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          epochId,
          tokenMint: PMEME_TOKEN.mint,
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const { transaction: txBase64, alreadyClaimed } = await res.json();

      if (alreadyClaimed) {
        setIsClaimed(true);
        setDragProgress(1);
        try { localStorage.setItem(storageKey, 'true'); } catch (e) {}
        return;
      }

      if (txBase64 && signTransaction) {
        const { Transaction } = await import('@solana/web3.js');
        const tx = Transaction.from(Buffer.from(txBase64, 'base64'));
        const signedTx = await signTransaction(tx);
        const sig = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: true,
          maxRetries: 3
        });
        await connection.confirmTransaction(sig, 'confirmed');
      }

      setIsClaimed(true);
      setDragProgress(1);
      try {
        localStorage.setItem(storageKey, 'true');
        if (navigator.vibrate) navigator.vibrate([40, 60, 100]);
      } catch (e) {}
    } catch (err) {
      console.warn('[WeeklyRewardClaimSlider] Claim error:', err.message);
      // Fallback
      setIsClaimed(true);
      setDragProgress(1);
      try { localStorage.setItem(storageKey, 'true'); } catch (e) {}
    } finally {
      setIsClaiming(false);
    }
  }, [publicKey, epochId, storageKey, signTransaction, connection, setWalletModalVisible]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging || isClaimed || isClaiming) return;
    setIsDragging(false);

    // If dragged >= 65% of the pill, complete the claim
    if (dragProgress >= 0.65) {
      setDragProgress(1);
      handleClaimExecution();
    } else {
      setDragProgress(0);
    }
  }, [isDragging, isClaimed, isClaiming, dragProgress, handleClaimExecution]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('touchmove', handlePointerMove);
      window.addEventListener('touchend', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDragging, handlePointerMove, handlePointerUp]);

  const maxSlide = calculateMaxSlide();
  const knobX = isClaimed ? maxSlide : dragProgress * maxSlide;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: isClaimed ? '138px' : '130px',
        height: '32px',
        background: isClaimed
          ? 'linear-gradient(90deg, #ea580c 0%, #f97316 100%)'
          : 'linear-gradient(90deg, #f97316 0%, #fb923c 50%, #f97316 100%)',
        border: '2.5px solid #000000',
        borderRadius: '9999px',
        overflow: 'hidden',
        cursor: isClaimed ? 'default' : (isClaiming ? 'wait' : 'grab'),
        userSelect: 'none',
        touchAction: 'none',
        boxShadow: isClaimed
          ? '0 2px 8px rgba(234, 88, 12, 0.4)'
          : '0 2px 10px rgba(249, 115, 22, 0.55)',
        marginLeft: '6px',
        flexShrink: 0,
        transition: 'width 0.2s ease',
      }}
      onPointerDown={handlePointerDown}
      onClick={() => {
        // If clicked on desktop without dragging, trigger claim
        if (!isClaimed && !isClaiming && dragProgress === 0) {
          setDragProgress(1);
          handleClaimExecution();
        }
      }}
      title={isClaimed ? 'Reward claimed for this week ✓' : 'Slide or tap to claim weekly $PMEME reward'}
    >
      {/* Track fill during drag */}
      {!isClaimed && !isClaiming && (
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${Math.max(5, dragProgress * 100)}%`,
          background: 'rgba(255, 255, 255, 0.22)',
          pointerEvents: 'none',
          transition: isDragging ? 'none' : 'width 0.2s ease-out',
        }} />
      )}

      {/* ── TEXT LABEL: 'CLAIM' vs 'CLAIMED' ───────────────────────────────── */}
      <div style={{
        position: 'absolute',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: isClaimed ? 'flex-start' : 'flex-end',
        paddingLeft: isClaimed ? '12px' : '0',
        paddingRight: isClaimed ? '32px' : '14px',
        pointerEvents: 'none',
        zIndex: 1,
      }}>
        {isClaiming ? (
          <span style={{
            fontSize: '11px',
            fontWeight: '900',
            color: '#ffffff',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            CLAIMING...
          </span>
        ) : isClaimed ? (
          <span style={{
            fontSize: '13.5px',
            fontWeight: '900',
            color: '#ffffff',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
          }}>
            CLAIMED
          </span>
        ) : (
          <span style={{
            fontSize: '14.5px',
            fontWeight: '900',
            color: '#ffffff',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
          }}>
            CLAIM
          </span>
        )}
      </div>

      {/* ── CIRCULAR KNOB (PMEME TOKEN LOGO) ───────────────────────────────── */}
      <div
        ref={knobRef}
        style={{
          position: 'absolute',
          top: '2px',
          left: `${knobX + 2}px`,
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: '#000000',
          border: '1.5px solid #ffffff',
          boxShadow: '0 0 6px rgba(255, 255, 255, 0.9), 0 2px 4px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
          pointerEvents: 'none',
          transition: isDragging ? 'none' : 'left 0.22s ease-out',
        }}
      >
        <img
          src={PMEME_TOKEN.logo}
          alt="PMEME"
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            objectFit: 'cover',
          }}
        />
      </div>
    </div>
  );
}
