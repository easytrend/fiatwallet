import React, { useState, useRef, useEffect, useCallback } from 'react';

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
 * Matches user's visual mockup:
 * - Unclaimed: Orange pill, circular PMEME logo on left, bold white "CLAIM" -> slide right.
 * - Claimed: Orange pill, bold white "CLAIMED" on left, circular PMEME logo on right.
 * - Anticipation Mode: Since real claim tokens aren't live yet, stays CLAIMED for 10 seconds,
 *   then smoothly returns back to CLAIM so users can interact and anticipate the real launch.
 */
export default function WeeklyRewardClaimSlider({
  walletAddress,
  rank = null,
  points = 0,
  epochId = 'current_week',
}) {
  const containerRef = useRef(null);
  const knobRef = useRef(null);
  const resetTimerRef = useRef(null);

  const storageKey = `fiatwallet_reward_claimed_${epochId}_${walletAddress || 'guest'}`;
  const [isClaimed, setIsClaimed] = useState(false);
  const [dragProgress, setDragProgress] = useState(0); // 0 to 1
  const [isDragging, setIsDragging] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  // Clean up any active timers on unmount
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  // Sync state with localStorage (handle 10-second expiration and legacy entries)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;

      // Clear legacy boolean values
      if (raw === 'true' || raw === 'false') {
        localStorage.removeItem(storageKey);
        setIsClaimed(false);
        setDragProgress(0);
        return;
      }

      let claimedAt = 0;
      try {
        const parsed = JSON.parse(raw);
        claimedAt = Number(parsed.claimedAt) || 0;
      } catch (e) {}

      const elapsed = Date.now() - claimedAt;
      if (claimedAt > 0 && elapsed < 10000) {
        setIsClaimed(true);
        setDragProgress(1);
        const remaining = 10000 - elapsed;
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => {
          setIsClaimed(false);
          setDragProgress(0);
          try { localStorage.removeItem(storageKey); } catch (e) {}
        }, remaining);
      } else {
        localStorage.removeItem(storageKey);
        setIsClaimed(false);
        setDragProgress(0);
      }
    } catch (e) {}
  }, [storageKey]);

  // Handle Drag Math
  const startXRef = useRef(0);
  const maxSlideRef = useRef(0);

  const calculateMaxSlide = useCallback((claimed = isClaimed) => {
    if (containerRef.current && knobRef.current) {
      const cWidth = containerRef.current.offsetWidth || (claimed ? 102 : 92);
      const kWidth = knobRef.current.offsetWidth || 19;
      return Math.max(0, cWidth - kWidth - 3); // 1.5px padding each side
    }
    return claimed ? 80 : 70;
  }, [isClaimed]);

  const handlePointerDown = (e) => {
    if (isClaimed || isClaiming) return;
    setIsDragging(true);
    startXRef.current = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    maxSlideRef.current = calculateMaxSlide(false);
  };

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || isClaimed || isClaiming) return;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    const deltaX = clientX - startXRef.current;
    const maxSlide = maxSlideRef.current || calculateMaxSlide(false);
    const newX = Math.max(0, Math.min(maxSlide, deltaX));
    const progress = maxSlide > 0 ? newX / maxSlide : 0;
    setDragProgress(progress);
  }, [isDragging, isClaimed, isClaiming, calculateMaxSlide]);

  const triggerClaimFlow = useCallback(() => {
    setIsClaiming(true);

    try {
      if (navigator.vibrate) navigator.vibrate([40, 60, 80]);
    } catch (e) {}

    // Transition to CLAIMED
    setIsClaimed(true);
    setDragProgress(1);
    setIsClaiming(false);

    // Persist timestamp for recovery if refreshed during the 10 seconds
    try {
      localStorage.setItem(storageKey, JSON.stringify({ claimedAt: Date.now() }));
    } catch (e) {}

    // Automatically return back to CLAIM after 10 seconds
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setIsClaimed(false);
      setDragProgress(0);
      try {
        localStorage.removeItem(storageKey);
      } catch (e) {}
    }, 10000);
  }, [storageKey]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging || isClaimed || isClaiming) return;
    setIsDragging(false);

    // If dragged >= 60% of the pill, complete the claim
    if (dragProgress >= 0.6) {
      setDragProgress(1);
      triggerClaimFlow();
    } else {
      setDragProgress(0);
    }
  }, [isDragging, isClaimed, isClaiming, dragProgress, triggerClaimFlow]);

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

  // Position calculation for smooth animation in both directions
  const unclaimedMaxSlide = 70; // 92 - 19 - 3
  const claimedMaxSlide = 80;   // 102 - 19 - 3
  const knobLeftPx = isClaimed
    ? (claimedMaxSlide + 1.5)
    : (dragProgress * unclaimedMaxSlide + 1.5);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: isClaimed ? '102px' : '92px',
        height: '24px',
        background: isClaimed
          ? 'linear-gradient(90deg, #ea580c 0%, #f97316 100%)'
          : 'linear-gradient(90deg, #f97316 0%, #fb923c 50%, #f97316 100%)',
        border: '1.5px solid #000000',
        borderRadius: '9999px',
        overflow: 'hidden',
        cursor: isClaimed ? 'default' : (isClaiming ? 'wait' : 'grab'),
        userSelect: 'none',
        touchAction: 'none',
        boxShadow: isClaimed
          ? '0 2px 6px rgba(234, 88, 12, 0.35)'
          : '0 2px 8px rgba(249, 115, 22, 0.5)',
        flexShrink: 0,
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s ease',
      }}
      onPointerDown={handlePointerDown}
      onClick={() => {
        // If clicked without dragging, trigger claim
        if (!isClaimed && !isClaiming && dragProgress === 0) {
          triggerClaimFlow();
        }
      }}
      title={isClaimed ? 'Reward claimed! Returning to claim in 10s (Anticipation Mode)' : 'Slide or tap to test weekly claim (Anticipation Mode)'}
    >
      {/* Track fill during drag */}
      {!isClaimed && !isClaiming && dragProgress > 0 && (
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
        paddingLeft: isClaimed ? '9px' : '0',
        paddingRight: isClaimed ? '24px' : '9px',
        pointerEvents: 'none',
        zIndex: 1,
        transition: 'all 0.25s ease',
      }}>
        {isClaiming ? (
          <span style={{
            fontSize: '9px',
            fontWeight: '900',
            color: '#ffffff',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}>
            CLAIMING...
          </span>
        ) : isClaimed ? (
          <span style={{
            fontSize: '10.5px',
            fontWeight: '900',
            color: '#ffffff',
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
          }}>
            CLAIMED
          </span>
        ) : (
          <span style={{
            fontSize: '11.5px',
            fontWeight: '900',
            color: '#ffffff',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
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
          top: '1px',
          left: `${knobLeftPx}px`,
          width: '19px',
          height: '19px',
          borderRadius: '50%',
          background: '#000000',
          border: '1.5px solid #ffffff',
          boxShadow: '0 0 4px rgba(255, 255, 255, 0.9), 0 1px 3px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
          pointerEvents: 'none',
          transition: isDragging ? 'none' : 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
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
