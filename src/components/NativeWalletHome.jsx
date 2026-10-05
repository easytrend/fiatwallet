import { useState, useMemo } from 'react';
import fiatpayLogo from '../assets/fiatpay.png';

const KNOWN_LOGOS = {
  USDC: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  USDT: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
  SOL:  'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
};

// ── SVG icons for each feature ───────────────────────────────────────────────

function IconP2P() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function IconBulkSend() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}

function IconExplorer() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

function ClaimSolLogo() {
  return (
    <div style={{
      position: 'relative',
      width: '30px',
      height: '18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Official Solana S Logo */}
      <svg viewBox="0 0 21 18" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '15px', height: '13px', display: 'block' }}>
        <path d="M 3.8 1 H 20.2 L 17.4 5 H 1 Z" fill="url(#grid-solana-gradient)" />
        <path d="M 1 7 H 17.4 L 20.2 11 H 3.8 Z" fill="url(#grid-solana-gradient)" />
        <path d="M 3.8 13 H 20.2 L 17.4 17 H 1 Z" fill="url(#grid-solana-gradient)" />
        <defs>
          <linearGradient id="grid-solana-gradient" x1="0" y1="18" x2="21" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#9945FF" />
            <stop offset="100%" stopColor="#14F195" />
          </linearGradient>
        </defs>
      </svg>
      {/* Custom Green/White Medicine Capsule */}
      <div style={{
        position: 'absolute',
        right: '-1px',
        top: '1px',
        width: '16px',
        height: '9px',
        borderRadius: '9999px',
        transform: 'rotate(-35deg)',
        background: 'linear-gradient(90deg, #fff 50%, #14F195 50%)',
        border: '1px solid rgba(0,0,0,0.25)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
      }} />
    </div>
  );
}

export default function NativeWalletHome({
  walletAddress,
  isInternal,
  walletTokenList,
  solBalance,
  liveSolPrice,
  liveRates,
  currency,
  currRate,
  onOpenMenu,
  onOpenReceive,
  onNavigateTab,
  onRefreshBalances,
  walletLoading,
  onSelectToken,
}) {
  const [showAllAssets, setShowAllAssets] = useState(false);

  // ── Token data ───────────────────────────────────────────────────────────
  const usdcToken = useMemo(() => {
    const found = walletTokenList?.find(t => t.symbol === 'USDC');
    return {
      symbol:   'USDC',
      name:     'USD Coin',
      balance:  found?.balance  || 0,
      price:    found?.price    || 1.0,
      logoURI:  found?.logoURI  || KNOWN_LOGOS.USDC,
      mint:     found?.mint     || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    };
  }, [walletTokenList]);

  const usdtToken = useMemo(() => {
    const found = walletTokenList?.find(t => t.symbol === 'USDT');
    return {
      symbol:   'USDT',
      name:     'Tether USD',
      balance:  found?.balance  || 0,
      price:    found?.price    || 1.0,
      logoURI:  found?.logoURI  || KNOWN_LOGOS.USDT,
      mint:     found?.mint     || 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    };
  }, [walletTokenList]);

  const solToken = useMemo(() => ({
    symbol:   'SOL',
    name:     'Solana',
    balance:  solBalance   || 0,
    price:    liveSolPrice || 150,
    logoURI:  KNOWN_LOGOS.SOL,
    mint:     null,
  }), [solBalance, liveSolPrice]);

  const otherTokens = useMemo(() => {
    if (!walletTokenList) return [];
    return walletTokenList.filter(
      t => t.symbol !== 'USDC' && t.symbol !== 'USDT' && t.symbol !== 'SOL'
    );
  }, [walletTokenList]);

  // ── Portfolio in USD (not USDC label) ───────────────────────────────────
  const totalPortfolioUSD = useMemo(() => {
    let total = 0;
    total += (usdcToken.balance || 0) * (usdcToken.price || 1);
    total += (usdtToken.balance || 0) * (usdtToken.price || 1);
    total += (solToken.balance  || 0) * (solToken.price  || 0);
    otherTokens.forEach(t => { total += (t.balance || 0) * (t.price || 0); });
    return total;
  }, [usdcToken, usdtToken, solToken, otherTokens]);

  // local-currency equivalent
  const fiatValue = totalPortfolioUSD * (currRate || 1);

  // ── Feature grid items ───────────────────────────────────────────────────
  const features = [
    {
      key:     'p2p',
      label:   'P2P Trade',
      icon:    <IconP2P />,
      onClick: () => onNavigateTab('p2p'),
    },
    {
      key:     'explorer',
      label:   'Explorer',
      icon:    <IconExplorer />,
      onClick: () => onNavigateTab('explorer'),
    },
    {
      key:     'send-bulk',
      label:   'Bulk Send',
      icon:    <IconBulkSend />,
      onClick: () => onNavigateTab('send-bulk'),
    },
    {
      key:     'claim',
      label:   'Claim SOL',
      icon:    <ClaimSolLogo />,
      onClick: () => onNavigateTab('claim'),
    },
    {
      key:     'fiatpay',
      label:   'FiatPay',
      // Use the actual FiatPay logo image instead of an SVG
      icon:    (
        <img
          src={fiatpayLogo}
          alt="FiatPay"
          style={{ width: '22px', height: '22px', objectFit: 'contain' }}
        />
      ),
      onClick: () => onNavigateTab('fiatpay'),
    },
  ];

  return (
    <div style={{
      width:      '100%',
      maxWidth:   '480px',
      margin:     '0 auto',
      padding:    '8px 14px 24px 14px',
      fontFamily: 'var(--ff, sans-serif)',
      color:      'var(--text, #f0f6ff)',
      boxSizing:  'border-box',
    }}>

      {/* ── PORTFOLIO VALUE CARD ── */}
      <div style={{
        background:    'linear-gradient(180deg, rgba(17,30,56,0.65) 0%, rgba(10,22,40,0.85) 100%)',
        border:        '1px solid var(--border, rgba(255,255,255,0.09))',
        borderRadius:  '22px',
        padding:       '24px 20px',
        textAlign:     'center',
        marginBottom:  '20px',
        position:      'relative',
        boxShadow:     '0 12px 32px rgba(0,0,0,0.35)',
      }}>
        {/* Label row */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            '8px',
          fontSize:       '11px',
          fontWeight:     '700',
          color:          'var(--text3, rgba(240,246,255,0.5))',
          textTransform:  'uppercase',
          letterSpacing:  '0.06em',
          marginBottom:   '8px',
        }}>
          <span>Total Balance</span>
          <button
            onClick={onRefreshBalances}
            disabled={walletLoading}
            title="Refresh balance"
            style={{
              background: 'none',
              border:     'none',
              color:      'var(--text3)',
              cursor:     'pointer',
              fontSize:   '13px',
              padding:    '0 2px',
              opacity:    walletLoading ? 0.5 : 1,
            }}
          >
            {walletLoading ? '...' : '↻'}
          </button>
        </div>

        {/* Primary value in USD */}
        <div style={{
          fontSize:      '36px',
          fontWeight:    '800',
          letterSpacing: '-0.02em',
          color:         'white',
          marginBottom:  '4px',
          lineHeight:    1.1,
        }}>
          <span style={{ fontSize: '22px', fontWeight: '600', color: 'var(--text2)', verticalAlign: 'super', marginRight: '2px' }}>$</span>
          {totalPortfolioUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: '500', marginBottom: '4px' }}>
          USD
        </div>

        {/* Local currency equivalent — only shown if not USD */}
        {currency && currency !== 'USD' && (
          <div style={{
            fontSize:   '13px',
            color:      'var(--text2, rgba(240,246,255,0.65))',
            fontWeight: '500',
            marginTop:  '2px',
          }}>
            ≈ {currency === 'NGN' ? '₦' : currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$'}
            {fiatValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
          </div>
        )}

        {/* ── ACTION BUTTONS ROW ── */}
        <div style={{
          display:       'flex',
          justifyContent:'center',
          gap:           '28px',
          marginTop:     '22px',
          paddingTop:    '18px',
          borderTop:     '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Send */}
          <button
            onClick={() => onNavigateTab('send')}
            style={{
              display:       'flex',
              flexDirection: 'column',
              alignItems:    'center',
              gap:           '6px',
              background:    'none',
              border:        'none',
              cursor:        'pointer',
              color:         'white',
            }}
          >
            <div style={{
              width:          '48px',
              height:         '48px',
              borderRadius:   '50%',
              background:     'linear-gradient(135deg, rgba(163,230,53,0.2), rgba(163,230,53,0.08))',
              border:         '1px solid rgba(163,230,53,0.4)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontSize:       '20px',
              color:          'var(--lime, #a3e635)',
              fontWeight:     '800',
              transition:     'transform 0.15s',
            }}>
              ↑
            </div>
            <span style={{ fontSize: '12px', fontWeight: '700' }}>Send</span>
          </button>

          {/* Receive */}
          <button
            onClick={onOpenReceive}
            style={{
              display:       'flex',
              flexDirection: 'column',
              alignItems:    'center',
              gap:           '6px',
              background:    'none',
              border:        'none',
              cursor:        'pointer',
              color:         'white',
            }}
          >
            <div style={{
              width:          '48px',
              height:         '48px',
              borderRadius:   '50%',
              background:     'rgba(255,255,255,0.06)',
              border:         '1px solid var(--border2, rgba(255,255,255,0.15))',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontSize:       '20px',
              color:          'var(--cyan, #22d3ee)',
              fontWeight:     '800',
              transition:     'transform 0.15s',
            }}>
              ↓
            </div>
            <span style={{ fontSize: '12px', fontWeight: '700' }}>Receive</span>
          </button>

          {/* Swap */}
          <button
            onClick={() => onNavigateTab('swap')}
            style={{
              display:       'flex',
              flexDirection: 'column',
              alignItems:    'center',
              gap:           '6px',
              background:    'none',
              border:        'none',
              cursor:        'pointer',
              color:         'white',
            }}
          >
            <div style={{
              width:          '48px',
              height:         '48px',
              borderRadius:   '50%',
              background:     'rgba(255,255,255,0.06)',
              border:         '1px solid var(--border2, rgba(255,255,255,0.15))',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontSize:       '18px',
              color:          '#ffffff',
              fontWeight:     '800',
              transition:     'transform 0.15s',
            }}>
              ⇄
            </div>
            <span style={{ fontSize: '12px', fontWeight: '700' }}>Swap</span>
          </button>
        </div>
      </div>

      {/* ── APP FEATURES GRID (4 columns) ── */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          fontSize:      '11px',
          fontWeight:    '700',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color:         'var(--text3, rgba(240,246,255,0.45))',
          marginBottom:  '10px',
        }}>
          App Features
        </div>

        <div style={{
          display:               'grid',
          gridTemplateColumns:   'repeat(5, 1fr)',
          gap:                   '6px',
        }}>
          {features.map(f => (
            <div
              key={f.key}
              onClick={f.onClick}
              style={{
                background:    'rgba(17, 30, 56, 0.55)',
                border:        '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius:  '16px',
                padding:       '14px 4px',
                cursor:        'pointer',
                display:       'flex',
                flexDirection: 'column',
                alignItems:    'center',
                gap:           '8px',
                textAlign:     'center',
              }}
            >
              {/* Simple uniform icon circle */}
              <div style={{
                width:          '42px',
                height:         '42px',
                borderRadius:   '50%',
                background:     'rgba(255, 255, 255, 0.05)',
                border:         '1px solid rgba(255, 255, 255, 0.08)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                color:          '#ffffff',
                flexShrink:     0,
              }}>
                {f.icon}
              </div>

              {/* Simple uniform label — no neon colors */}
              <span style={{
                fontSize:   '11px',
                fontWeight: '600',
                color:      '#ffffff',
                lineHeight: 1.2,
              }}>
                {f.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── ASSETS LIST ── */}
      <div>
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   '12px',
        }}>
          <span style={{
            fontSize:      '11px',
            fontWeight:    '700',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color:         'var(--text3, rgba(240,246,255,0.45))',
          }}>
            Assets
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
            Solana Network
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* 1. SOL — always first */}
          <AssetRow
            asset={solToken}
            onSelect={() => {
              if (onSelectToken) onSelectToken('SOL');
              onNavigateTab('send');
            }}
          />

          {/* 2. USDC */}
          <AssetRow
            asset={usdcToken}
            onSelect={() => {
              if (onSelectToken) onSelectToken('USDC');
              onNavigateTab('send');
            }}
          />

          {/* 3. USDT */}
          <AssetRow
            asset={usdtToken}
            onSelect={() => {
              if (onSelectToken) onSelectToken('USDT');
              onNavigateTab('send');
            }}
          />

          {/* Expandable Other Tokens */}
          {showAllAssets && otherTokens.map((t, idx) => (
            <AssetRow
              key={t.mint || idx}
              asset={t}
              onSelect={() => {
                if (onSelectToken) onSelectToken(t.symbol);
                onNavigateTab('send');
              }}
            />
          ))}

          {/* Show / Hide All Assets Toggle */}
          {otherTokens.length > 0 && (
            <button
              onClick={() => setShowAllAssets(!showAllAssets)}
              style={{
                width:        '100%',
                padding:      '12px',
                background:   'rgba(255,255,255,0.03)',
                border:       '1px solid var(--border, rgba(255,255,255,0.08))',
                borderRadius: '14px',
                color:        'var(--text2, rgba(240,246,255,0.6))',
                fontSize:     '12px',
                fontWeight:   '600',
                cursor:       'pointer',
                textAlign:    'center',
                transition:   'background 0.2s',
                marginTop:    '4px',
              }}
            >
              {showAllAssets
                ? '▲ Hide additional tokens'
                : `▼ Show all assets (${otherTokens.length} more)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AssetRow sub-component ───────────────────────────────────────────────────
function AssetRow({ asset, onSelect }) {
  const usdValue = (asset.balance || 0) * (asset.price || 0);

  return (
    <div
      onClick={onSelect}
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '14px 16px',
        background:     'rgba(17,30,56,0.55)',
        border:         '1px solid var(--border, rgba(255,255,255,0.08))',
        borderRadius:   '16px',
        cursor:         'pointer',
        transition:     'background 0.2s',
      }}
    >
      {/* Left: logo + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {asset.logoURI ? (
          <img
            src={asset.logoURI}
            alt={asset.symbol}
            style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div style={{
            width:          '36px',
            height:         '36px',
            borderRadius:   '50%',
            background:     'rgba(255,255,255,0.1)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            fontSize:       '12px',
            fontWeight:     '700',
          }}>
            {asset.symbol.slice(0, 3)}
          </div>
        )}
        <div>
          <div style={{ fontWeight: '700', fontSize: '14px', color: 'white' }}>
            {asset.symbol}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3, rgba(240,246,255,0.45))' }}>
            {asset.name}
          </div>
        </div>
      </div>

      {/* Right: balance + USD value */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: 'white', fontFamily: 'var(--mono, monospace)' }}>
          {parseFloat((asset.balance || 0).toFixed(4))}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text2, rgba(240,246,255,0.55))' }}>
          ${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
    </div>
  );
}
