import { useState, useMemo } from 'react';

const KNOWN_LOGOS = {
  USDC: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  USDT: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
  SOL: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
};

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
  const [copied, setCopied] = useState(false);

  // 1. Resolve primary assets: USDC, USDT, SOL
  const usdcToken = useMemo(() => {
    const found = walletTokenList?.find(t => t.symbol === 'USDC');
    return {
      symbol: 'USDC',
      name: 'USD Coin',
      balance: found?.balance || 0,
      price: found?.price || 1.0,
      logoURI: found?.logoURI || KNOWN_LOGOS.USDC,
      mint: found?.mint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    };
  }, [walletTokenList]);

  const usdtToken = useMemo(() => {
    const found = walletTokenList?.find(t => t.symbol === 'USDT');
    return {
      symbol: 'USDT',
      name: 'Tether USD',
      balance: found?.balance || 0,
      price: found?.price || 1.0,
      logoURI: found?.logoURI || KNOWN_LOGOS.USDT,
      mint: found?.mint || 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    };
  }, [walletTokenList]);

  const solToken = useMemo(() => {
    return {
      symbol: 'SOL',
      name: 'Solana',
      balance: solBalance || 0,
      price: liveSolPrice || 150,
      logoURI: KNOWN_LOGOS.SOL,
      mint: null,
    };
  }, [solBalance, liveSolPrice]);

  // 2. Resolve other assets held or available
  const otherTokens = useMemo(() => {
    if (!walletTokenList) return [];
    return walletTokenList.filter(t => t.symbol !== 'USDC' && t.symbol !== 'USDT' && t.symbol !== 'SOL');
  }, [walletTokenList]);

  // 3. Compute Total Portfolio Value in USDC
  const totalPortfolioUSDC = useMemo(() => {
    let total = 0;
    // Primary assets
    total += (usdcToken.balance || 0) * (usdcToken.price || 1);
    total += (usdtToken.balance || 0) * (usdtToken.price || 1);
    total += (solToken.balance || 0) * (solToken.price || 0);

    // Other SPL tokens
    otherTokens.forEach(t => {
      total += (t.balance || 0) * (t.price || 0);
    });
    return total;
  }, [usdcToken, usdtToken, solToken, otherTokens]);

  const fiatValue = totalPortfolioUSDC * (currRate || 1600);

  const handleCopyAddr = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shortAddr = walletAddress ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}` : 'Connect';

  return (
    <div style={{
      width: '100%',
      maxWidth: '480px',
      margin: '0 auto',
      padding: '16px 14px 80px 14px',
      fontFamily: 'var(--ff, sans-serif)',
      color: 'var(--text, #f0f6ff)',
      boxSizing: 'border-box',
    }}>
      {/* ── TOP HEADER BAR ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
      }}>
        {/* Menu Hamburger Button */}
        <button
          onClick={onOpenMenu}
          aria-label="Open menu"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
            borderRadius: '12px',
            width: '42px',
            height: '42px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '18px',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          ☰
        </button>

        {/* Address Pill */}
        <div
          onClick={handleCopyAddr}
          title="Click to copy address"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(10, 22, 40, 0.7)',
            border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
            borderRadius: '20px',
            padding: '6px 14px',
            cursor: 'pointer',
            fontSize: '12px',
            fontFamily: 'var(--mono, monospace)',
          }}
        >
          <span style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: 'var(--lime, #a3e635)',
            boxShadow: '0 0 6px var(--lime, #a3e635)',
          }} />
          <span style={{ color: 'white', fontWeight: '600' }}>{shortAddr}</span>
          <span style={{ fontSize: '10px', color: copied ? 'var(--lime)' : 'var(--text3)' }}>
            {copied ? '✓' : '⧉'}
          </span>
        </div>

        {/* Receive QR Button */}
        <button
          onClick={onOpenReceive}
          aria-label="Receive crypto"
          title="Receive QR code"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
            borderRadius: '12px',
            width: '42px',
            height: '42px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--lime, #a3e635)',
            fontSize: '14px',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          QR
        </button>
      </div>

      {/* ── PORTFOLIO VALUE HEADER ── */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(17, 30, 56, 0.65) 0%, rgba(10, 22, 40, 0.85) 100%)',
        border: '1px solid var(--border, rgba(255, 255, 255, 0.09))',
        borderRadius: '22px',
        padding: '24px 20px',
        textAlign: 'center',
        marginBottom: '20px',
        position: 'relative',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          fontSize: '11px',
          fontWeight: '700',
          color: 'var(--text3, rgba(240, 246, 255, 0.5))',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '8px',
        }}>
          <span>Total Asset Value</span>
          <button
            onClick={onRefreshBalances}
            disabled={walletLoading}
            title="Refresh balance"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text3)',
              cursor: 'pointer',
              fontSize: '13px',
              padding: '0 2px',
              opacity: walletLoading ? 0.5 : 1,
            }}
          >
            {walletLoading ? '...' : '↻'}
          </button>
        </div>

        <div style={{
          fontSize: '34px',
          fontWeight: '800',
          letterSpacing: '-0.02em',
          color: 'white',
          marginBottom: '6px',
        }}>
          ${totalPortfolioUSDC.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          <span style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text2)', marginLeft: '6px' }}>USDC</span>
        </div>

        <div style={{
          fontSize: '13px',
          color: 'var(--text2, rgba(240, 246, 255, 0.65))',
          fontWeight: '500',
        }}>
          ≈ {currency === 'NGN' ? '₦' : '$'}{fiatValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
        </div>

        {/* ── ACTION BUTTONS ROW (SEND / RECEIVE / SWAP) ── */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '24px',
          marginTop: '22px',
          paddingTop: '18px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        }}>
          {/* Send */}
          <button
            onClick={() => onNavigateTab('send')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'white',
            }}
          >
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(163, 230, 53, 0.2), rgba(163, 230, 53, 0.08))',
              border: '1px solid rgba(163, 230, 53, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              color: 'var(--lime, #a3e635)',
              fontWeight: '800',
              transition: 'transform 0.15s',
            }}>
              ↑
            </div>
            <span style={{ fontSize: '12px', fontWeight: '700' }}>Send</span>
          </button>

          {/* Receive */}
          <button
            onClick={onOpenReceive}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'white',
            }}
          >
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--border2, rgba(255, 255, 255, 0.15))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              color: 'var(--cyan, #22d3ee)',
              fontWeight: '800',
              transition: 'transform 0.15s',
            }}>
              ↓
            </div>
            <span style={{ fontSize: '12px', fontWeight: '700' }}>Receive</span>
          </button>

          {/* Swap */}
          <button
            onClick={() => onNavigateTab('swap')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'white',
            }}
          >
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--border2, rgba(255, 255, 255, 0.15))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              color: '#ffffff',
              fontWeight: '800',
              transition: 'transform 0.15s',
            }}>
              ⇄
            </div>
            <span style={{ fontSize: '12px', fontWeight: '700' }}>Swap</span>
          </button>
        </div>
      </div>

      {/* ── APP FEATURES GRID ── */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          fontSize: '11px',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text3, rgba(240, 246, 255, 0.45))',
          marginBottom: '10px',
        }}>
          App Features
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '10px',
        }}>
          {/* P2P Trading */}
          <div
            onClick={() => onNavigateTab('p2p')}
            style={{
              background: 'rgba(17, 30, 56, 0.6)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.09))',
              borderRadius: '16px',
              padding: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--lime, #a3e635)' }}>
                P2P Trade
              </span>
              <span style={{
                fontSize: '9px',
                padding: '2px 6px',
                borderRadius: '6px',
                background: 'rgba(163, 230, 53, 0.12)',
                color: 'var(--lime)',
                fontWeight: '700',
              }}>
                Instant
              </span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'white', marginBottom: '3px' }}>
              Buy &amp; Sell Fiat
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3, rgba(240, 246, 255, 0.45))', lineHeight: '1.3' }}>
              Direct bank transfer offramp
            </div>
          </div>

          {/* Bulk Send */}
          <div
            onClick={() => onNavigateTab('send-bulk')}
            style={{
              background: 'rgba(17, 30, 56, 0.6)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.09))',
              borderRadius: '16px',
              padding: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--cyan, #22d3ee)' }}>
                Bulk Send
              </span>
              <span style={{
                fontSize: '9px',
                padding: '2px 6px',
                borderRadius: '6px',
                background: 'rgba(34, 211, 238, 0.12)',
                color: 'var(--cyan)',
                fontWeight: '700',
              }}>
                Batch
              </span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'white', marginBottom: '3px' }}>
              Multi-Wallet Payout
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3, rgba(240, 246, 255, 0.45))', lineHeight: '1.3' }}>
              Distribute to many addresses
            </div>
          </div>

          {/* Claim SOL (Rent Cashback) */}
          <div
            onClick={() => onNavigateTab('claim')}
            style={{
              background: 'rgba(17, 30, 56, 0.6)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.09))',
              borderRadius: '16px',
              padding: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#fde047' }}>
                Claim SOL
              </span>
              <span style={{
                fontSize: '9px',
                padding: '2px 6px',
                borderRadius: '6px',
                background: 'rgba(253, 224, 71, 0.12)',
                color: '#fde047',
                fontWeight: '700',
              }}>
                Cashback
              </span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'white', marginBottom: '3px' }}>
              Rent Reclaim
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3, rgba(240, 246, 255, 0.45))', lineHeight: '1.3' }}>
              Recover locked SOL fees
            </div>
          </div>

          {/* FiatPay */}
          <div
            onClick={() => onNavigateTab('fiatpay')}
            style={{
              background: 'rgba(17, 30, 56, 0.6)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.09))',
              borderRadius: '16px',
              padding: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#c084fc' }}>
                FiatPay
              </span>
              <span style={{
                fontSize: '9px',
                padding: '2px 6px',
                borderRadius: '6px',
                background: 'rgba(192, 132, 252, 0.12)',
                color: '#c084fc',
                fontWeight: '700',
              }}>
                Web3
              </span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'white', marginBottom: '3px' }}>
              On-Chain Pay
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3, rgba(240, 246, 255, 0.45))', lineHeight: '1.3' }}>
              Checkout via @FiatTag
            </div>
          </div>
        </div>
      </div>

      {/* ── ASSETS LIST ── */}
      <div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}>
          <span style={{
            fontSize: '11px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text3, rgba(240, 246, 255, 0.45))',
          }}>
            Assets
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
            Solana Network
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* 1. USDC */}
          <AssetRow
            asset={usdcToken}
            onSelect={() => {
              if (onSelectToken) onSelectToken('USDC');
              onNavigateTab('send');
            }}
          />

          {/* 2. USDT */}
          <AssetRow
            asset={usdtToken}
            onSelect={() => {
              if (onSelectToken) onSelectToken('USDT');
              onNavigateTab('send');
            }}
          />

          {/* 3. SOL */}
          <AssetRow
            asset={solToken}
            onSelect={() => {
              if (onSelectToken) onSelectToken('SOL');
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

          {/* Show / Hide All Assets Dropdown Button */}
          {otherTokens.length > 0 && (
            <button
              onClick={() => setShowAllAssets(!showAllAssets)}
              style={{
                width: '100%',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
                borderRadius: '14px',
                color: 'var(--text2, rgba(240, 246, 255, 0.6))',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'background 0.2s',
                marginTop: '4px',
              }}
            >
              {showAllAssets ? '▲ Hide additional tokens' : `▼ Show all assets (${otherTokens.length} more)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Sub-component for individual asset row
function AssetRow({ asset, onSelect }) {
  const value = (asset.balance || 0) * (asset.price || 0);

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        background: 'rgba(17, 30, 56, 0.55)',
        border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
        borderRadius: '16px',
        cursor: 'pointer',
        transition: 'background 0.2s',
      }}
    >
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
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: '700',
          }}>
            {asset.symbol.slice(0, 3)}
          </div>
        )}
        <div>
          <div style={{ fontWeight: '700', fontSize: '14px', color: 'white' }}>
            {asset.symbol}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3, rgba(240, 246, 255, 0.45))' }}>
            {asset.name}
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: 'white', fontFamily: 'var(--mono, monospace)' }}>
          {parseFloat((asset.balance || 0).toFixed(4))}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text2, rgba(240, 246, 255, 0.55))' }}>
          ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
    </div>
  );
}
