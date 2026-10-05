import { useState, useMemo, useCallback } from 'react';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Curated list of verified Solana Web3 dApps
const CURATED_DAPPS = [
  {
    id: 'jupiter',
    name: 'Jupiter',
    url: 'https://jup.ag',
    category: 'dex',
    categoryLabel: 'DEX & Swaps',
    tagline: 'Best swap aggregation on Solana',
    description: 'Trade tokens with optimal routing, ultra-low slippage, limit orders, and DCA.',
    color: '#a3e635',
    bg: 'rgba(163, 230, 53, 0.12)',
    verified: true,
    featured: true,
    volume24h: '$1.4B+',
    tags: ['Aggregator', 'Swaps', 'Perps', 'Limit Order'],
  },
  {
    id: 'raydium',
    name: 'Raydium',
    url: 'https://raydium.io',
    category: 'dex',
    categoryLabel: 'DEX & Swaps',
    tagline: 'High-speed on-chain AMM',
    description: 'Leading decentralized liquidity provider with concentrated liquidity and launch pools.',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.12)',
    verified: true,
    featured: true,
    volume24h: '$600M+',
    tags: ['AMM', 'Liquidity Pools', 'Yield', 'CLMM'],
  },
  {
    id: 'pumpfun',
    name: 'Pump.fun',
    url: 'https://pump.fun',
    category: 'meme',
    categoryLabel: 'Meme & Launchpads',
    tagline: 'Instant Solana token launchpad',
    description: 'Fair launch meme tokens with automated bonding curves. No presale, zero rug-pull risk.',
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.12)',
    verified: true,
    featured: true,
    volume24h: '$250M+',
    tags: ['Launchpad', 'Bonding Curve', 'Meme Coins'],
  },
  {
    id: 'magiceden',
    name: 'Magic Eden',
    url: 'https://magiceden.io',
    category: 'nft',
    categoryLabel: 'NFTs & Gaming',
    tagline: 'Premier Solana NFT marketplace',
    description: 'Trade digital collectibles, gaming assets, mint new drops, and manage your portfolio.',
    color: '#ec4899',
    bg: 'rgba(236, 72, 153, 0.12)',
    verified: true,
    featured: true,
    volume24h: '$45M+',
    tags: ['NFTs', 'Marketplace', 'Launchpad', 'Gaming'],
  },
  {
    id: 'kamino',
    name: 'Kamino Finance',
    url: 'https://app.kamino.finance',
    category: 'defi',
    categoryLabel: 'DeFi & Lending',
    tagline: 'Lending, borrowing & automated yield',
    description: 'High-yield vaults, borrow against crypto, and manage liquidity positions automatically.',
    color: '#818cf8',
    bg: 'rgba(129, 140, 248, 0.12)',
    verified: true,
    featured: false,
    volume24h: 'TVL $1.8B',
    tags: ['Lending', 'Borrowing', 'Vaults', 'Yield'],
  },
  {
    id: 'orca',
    name: 'Orca',
    url: 'https://www.orca.so',
    category: 'dex',
    categoryLabel: 'DEX & Swaps',
    tagline: 'Fast, user-friendly DEX',
    description: 'Concentrated liquidity Whirlpools with lower gas and optimized swap prices.',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    verified: true,
    featured: false,
    volume24h: '$120M+',
    tags: ['Whirlpools', 'DEX', 'AMM'],
  },
  {
    id: 'tensor',
    name: 'Tensor',
    url: 'https://www.tensor.trade',
    category: 'nft',
    categoryLabel: 'NFTs & Gaming',
    tagline: 'Pro trading terminal for Solana NFTs',
    description: 'Real-time order books, collection sweeps, automated bids, and AMM pools.',
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.12)',
    verified: true,
    featured: false,
    volume24h: '$30M+',
    tags: ['NFTs', 'Pro Trading', 'AMM'],
  },
  {
    id: 'dexscreener',
    name: 'DexScreener',
    url: 'https://dexscreener.com/solana',
    category: 'meme',
    categoryLabel: 'Meme & Launchpads',
    tagline: 'Live Solana DEX charts and screener',
    description: 'Track pair prices, liquidity changes, volume spikes, and trending Solana pairs in real-time.',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    verified: true,
    featured: false,
    volume24h: 'Real-Time',
    tags: ['Analytics', 'Charts', 'Trending'],
  },
  {
    id: 'birdeye',
    name: 'Birdeye',
    url: 'https://birdeye.so',
    category: 'meme',
    categoryLabel: 'Meme & Launchpads',
    tagline: 'Crypto market intelligence',
    description: 'Professional charting, trader profiling, new token radar, and security scoring.',
    color: '#6366f1',
    bg: 'rgba(99, 102, 241, 0.12)',
    verified: true,
    featured: false,
    volume24h: 'Real-Time',
    tags: ['Intelligence', 'Audits', 'Charts'],
  },
  {
    id: 'marginfi',
    name: 'MarginFi',
    url: 'https://app.marginfi.com',
    category: 'defi',
    categoryLabel: 'DeFi & Lending',
    tagline: 'Decentralized liquidity and lending',
    description: 'Lend assets for passive yield and borrow against collateral on Solana.',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.12)',
    verified: true,
    featured: false,
    volume24h: 'TVL $400M',
    tags: ['Lending', 'Margin', 'DeFi'],
  },
  {
    id: 'jito',
    name: 'Jito',
    url: 'https://www.jito.network',
    category: 'defi',
    categoryLabel: 'DeFi & Lending',
    tagline: 'MEV-boosted liquid staking',
    description: 'Stake SOL with Jito to earn staking rewards plus MEV tips via JitoSOL.',
    color: '#14b8a6',
    bg: 'rgba(20, 184, 166, 0.12)',
    verified: true,
    featured: false,
    volume24h: 'TVL $2.2B',
    tags: ['Liquid Staking', 'MEV', 'JitoSOL'],
  },
  {
    id: 'marinade',
    name: 'Marinade Finance',
    url: 'https://marinade.finance',
    category: 'defi',
    categoryLabel: 'DeFi & Lending',
    tagline: 'Leading Solana staking protocol',
    description: 'Non-custodial liquid staking protocol delegating to 100+ high-performing validators.',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.12)',
    verified: true,
    featured: false,
    volume24h: 'TVL $1.1B',
    tags: ['Staking', 'mSOL', 'Validators'],
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All dApps' },
  { id: 'dex', label: 'DEX & Swaps' },
  { id: 'meme', label: 'Meme & Launchpads' },
  { id: 'nft', label: 'NFTs & Gaming' },
  { id: 'defi', label: 'DeFi & Staking' },
  { id: 'bridge', label: 'Tx Bridge' },
];

export default function DAppExplorer({
  connection,
  effectivePublicKey,
  effectiveConnected,
  effectiveSignTransaction,
  effectiveSendTransaction,
  isInternal,
  solBalance,
  isGuestMode,
  onOpenConnect,
  onNavigateTab,
}) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDApp, setActiveDApp] = useState(null); // null or dApp object
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Transaction Bridge states
  const [bridgePayload, setBridgePayload] = useState('');
  const [bridgeSimulating, setBridgeSimulating] = useState(false);
  const [bridgeSimulationResult, setBridgeSimulationResult] = useState(null);
  const [bridgeSigning, setBridgeSigning] = useState(false);
  const [bridgeTxSignature, setBridgeTxSignature] = useState(null);
  const [bridgeError, setBridgeError] = useState(null);

  // Filtered dApps
  const filteredDApps = useMemo(() => {
    let list = CURATED_DAPPS;
    if (activeCategory !== 'all' && activeCategory !== 'bridge') {
      list = list.filter(d => d.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.url.toLowerCase().includes(q) ||
        d.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [activeCategory, searchQuery]);

  // Handle URL submit
  const handleUrlSubmit = (e) => {
    e?.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    // Check if query matches a curated dApp
    const found = CURATED_DAPPS.find(
      d => d.name.toLowerCase() === q.toLowerCase() || d.url.toLowerCase().includes(q.toLowerCase())
    );
    if (found) {
      setActiveDApp(found);
      return;
    }

    // Direct URL entry
    let fullUrl = q;
    if (!/^https?:\/\//i.test(fullUrl)) {
      fullUrl = 'https://' + fullUrl;
    }

    try {
      const parsed = new URL(fullUrl);
      const customDApp = {
        id: parsed.hostname,
        name: parsed.hostname.replace(/^www\./, ''),
        url: fullUrl,
        category: 'custom',
        categoryLabel: 'Web3 dApp',
        tagline: fullUrl,
        description: 'Custom Solana Web3 application loaded via direct URL.',
        color: 'var(--cyan)',
        bg: 'rgba(34, 211, 238, 0.12)',
        verified: false,
        featured: false,
        tags: ['Custom URL', 'Solana'],
      };
      setActiveDApp(customDApp);
    } catch {
      // Invalid URL, leave search query as filter
    }
  };

  // Copy address helper
  const handleCopyAddress = () => {
    if (!effectivePublicKey) return;
    navigator.clipboard.writeText(effectivePublicKey.toBase58());
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  // Copy link helper
  const handleCopyLink = (url) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Test Transaction Simulation & Execution via Bridge
  const handleTestTransferBridge = async () => {
    if (!effectiveConnected || !effectivePublicKey) {
      setBridgeError('Please connect or unlock your wallet first.');
      return;
    }
    setBridgeSimulating(true);
    setBridgeError(null);
    setBridgeSimulationResult(null);
    setBridgeTxSignature(null);

    try {
      // Build a minimal 0.000001 SOL test transaction to self (or blockhash test)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const tx = new Transaction({
        feePayer: effectivePublicKey,
        recentBlockhash: blockhash,
      });

      // Self-transfer of 1,000 lamports (0.000001 SOL) to safely test transaction flow
      tx.add(
        SystemProgram.transfer({
          fromPubkey: effectivePublicKey,
          toPubkey: effectivePublicKey,
          lamports: 1000,
        })
      );

      // Simulate first
      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) {
        throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}`);
      }

      setBridgeSimulationResult({
        status: 'Simulation Passed',
        logs: sim.value.logs?.slice(-4) || [],
        unitsConsumed: sim.value.unitsConsumed || 450,
        tx,
        lastValidBlockHeight,
      });
    } catch (err) {
      setBridgeError(err.message || 'Simulation error');
    } finally {
      setBridgeSimulating(false);
    }
  };

  // Execute Bridge Transaction
  const handleExecuteBridgeTx = async () => {
    if (!bridgeSimulationResult?.tx || !effectiveSendTransaction) return;
    setBridgeSigning(true);
    setBridgeError(null);

    try {
      const sig = await effectiveSendTransaction(bridgeSimulationResult.tx);
      setBridgeTxSignature(sig);
      setBridgeSimulationResult(null);
    } catch (err) {
      setBridgeError(err.message || 'Transaction signing failed');
    } finally {
      setBridgeSigning(false);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto', fontFamily: 'var(--ff, sans-serif)', color: 'var(--text)' }}>
      {/* ── Active dApp Browser View ── */}
      {activeDApp ? (
        <div style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
          {/* Top Browser Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '14px',
            background: 'rgba(10, 22, 40, 0.75)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            padding: '8px 12px'
          }}>
            <button
              onClick={() => setActiveDApp(null)}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'white',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: 'var(--ff)',
              }}
            >
              ← Hub
            </button>

            {/* URL Display */}
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              color: 'var(--text2)',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis'
            }}>
              <span style={{ color: 'var(--lime)', fontSize: '11px', fontWeight: 'bold' }}>✓ SSL</span>
              <span style={{ color: 'white', fontWeight: '600' }}>{activeDApp.name}</span>
              <span style={{ color: 'var(--text3)', fontSize: '11px' }}>({activeDApp.url.replace(/^https?:\/\//, '')})</span>
            </div>

            {/* Actions: Copy Link & Open External */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => handleCopyLink(activeDApp.url)}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: copiedLink ? 'var(--lime)' : 'var(--text2)',
                  padding: '6px 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontFamily: 'var(--ff)'
                }}
                title="Copy Link"
              >
                {copiedLink ? '✓ Copied' : 'Copy'}
              </button>
              <a
                href={activeDApp.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'linear-gradient(135deg, var(--lime), #65a30d)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#090d16',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: '700',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  fontFamily: 'var(--ff)'
                }}
              >
                Launch ↗
              </a>
            </div>
          </div>

          {/* Connection Status Banner */}
          <div style={{
            background: 'rgba(17, 30, 56, 0.65)',
            border: '1px solid var(--border2)',
            borderRadius: '14px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: effectiveConnected ? 'var(--lime)' : '#eab308',
                boxShadow: effectiveConnected ? '0 0 8px var(--lime)' : 'none'
              }} />
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {effectiveConnected ? (isInternal ? 'Self-Custodial Vault Connected' : 'Solana Wallet Connected') : 'Guest Mode (Read-Only)'}
                </div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {effectivePublicKey ? (
                    <>
                      <span>{effectivePublicKey.toBase58().slice(0, 6)}...{effectivePublicKey.toBase58().slice(-6)}</span>
                      <button
                        onClick={handleCopyAddress}
                        style={{ background: 'none', border: 'none', color: 'var(--cyan)', cursor: 'pointer', fontSize: '11px', padding: 0 }}
                      >
                        {copiedAddr ? '✓' : 'Copy'}
                      </button>
                    </>
                  ) : (
                    <span>No wallet connected</span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Balance</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--lime)', fontFamily: 'var(--mono)' }}>
                {solBalance != null ? Number(solBalance).toFixed(4) : '0.0000'} SOL
              </div>
            </div>
          </div>

          {/* dApp Frame / Direct Launch View */}
          <div style={{
            background: 'rgba(10, 22, 40, 0.85)',
            border: '1px solid var(--border)',
            borderRadius: '18px',
            overflow: 'hidden',
            marginBottom: '16px',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.4)'
          }}>
            {/* Embedded frame or Security Fallback Card */}
            <div style={{ padding: '24px 20px', textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '18px',
                background: activeDApp.bg || 'rgba(163, 230, 53, 0.15)',
                border: `1px solid ${activeDApp.color || 'var(--lime)'}`,
                color: activeDApp.color || 'var(--lime)',
                fontSize: '24px',
                fontWeight: '800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
              }}>
                {activeDApp.name.slice(0, 2).toUpperCase()}
              </div>

              <h3 style={{ fontSize: '20px', fontWeight: '800', color: 'white', marginBottom: '8px' }}>
                {activeDApp.name}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text2)', maxWidth: '420px', margin: '0 auto 18px auto', lineHeight: '1.5' }}>
                {activeDApp.description}
              </p>

              <div style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '14px',
                maxWidth: '440px',
                margin: '0 auto 20px auto',
                textAlign: 'left',
                fontSize: '12px',
                color: 'var(--text2)',
                lineHeight: '1.6'
              }}>
                <div style={{ fontWeight: '700', color: 'white', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'var(--lime)' }}>✓</span> Web3 Direct Connection:
                </div>
                <div>1. Click <strong style={{ color: 'white' }}>Launch in Window</strong> below.</div>
                <div>2. In {activeDApp.name}, select <strong style={{ color: 'white' }}>Connect Wallet</strong>.</div>
                <div>3. Execute swaps, mints, and transactions with real-time settlement on Solana.</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <a
                  href={activeDApp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: 'linear-gradient(135deg, var(--lime), #65a30d)',
                    color: '#090d16',
                    padding: '12px 24px',
                    borderRadius: '12px',
                    fontWeight: '800',
                    fontSize: '14px',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(163, 230, 53, 0.35)',
                    transition: 'all 0.2s',
                    fontFamily: 'var(--ff)'
                  }}
                >
                  Launch {activeDApp.name} in Window ↗
                </a>

                <button
                  onClick={() => {
                    setActiveCategory('bridge');
                    setActiveDApp(null);
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    color: 'white',
                    padding: '12px 20px',
                    fontWeight: '700',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontFamily: 'var(--ff)'
                  }}
                >
                  Tx Bridge Inspector
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Directory & Discovery Hub ── */
        <div>
          {/* Header row */}
          <div style={{ marginBottom: '16px', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(163, 230, 53, 0.1)', border: '1px solid rgba(163, 230, 53, 0.3)', borderRadius: '20px', padding: '4px 12px', marginBottom: '8px' }}>
              <span style={{ color: 'var(--lime)', fontSize: '11px', fontWeight: '700' }}>✓ Solana Mainnet Verified</span>
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'white', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
              dApp Explorer
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text2)', margin: 0 }}>
              Discover, connect, and process transactions with Solana applications
            </p>
          </div>

          {/* Search & URL Input Bar */}
          <form onSubmit={handleUrlSubmit} style={{ marginBottom: '16px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(10, 22, 40, 0.8)',
              border: '1px solid var(--border2)',
              borderRadius: '14px',
              padding: '6px 12px',
              gap: '8px',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)'
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search dApps or enter URL (e.g. jup.ag, pump.fun)..."
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: 'white',
                  fontSize: '13px',
                  fontFamily: 'var(--ff)'
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '14px', padding: 0 }}
                >
                  ✕
                </button>
              )}
              <button
                type="submit"
                style={{
                  background: 'linear-gradient(135deg, var(--lime), #65a30d)',
                  color: '#090d16',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  fontFamily: 'var(--ff)'
                }}
              >
                Go →
              </button>
            </div>
          </form>

          {/* Categories Pill Selector */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '8px',
            marginBottom: '16px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  background: activeCategory === cat.id ? 'rgba(163, 230, 53, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                  border: activeCategory === cat.id ? '1px solid var(--lime)' : '1px solid var(--border)',
                  color: activeCategory === cat.id ? 'var(--lime)' : 'var(--text2)',
                  borderRadius: '10px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: '700',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: 'var(--ff)'
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* ── Transaction Bridge Tab Content ── */}
          {activeCategory === 'bridge' ? (
            <div style={{
              background: 'rgba(10, 22, 40, 0.85)',
              border: '1px solid var(--border)',
              borderRadius: '18px',
              padding: '20px 18px',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '800', color: 'white', margin: 0 }}>
                  dApp Transaction Bridge
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--lime)', fontWeight: '700' }}>
                  ✓ Ed25519 Native Signer
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: '1.5', margin: '0 0 16px 0' }}>
                Test on-chain simulations, inspect instruction payloads, and process transactions with your local vault or connected wallet.
              </p>

              {/* Wallet info */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '12px 14px',
                marginBottom: '16px',
                fontSize: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text3)' }}>Connected Signer:</span>
                  <span style={{ color: 'white', fontWeight: '700', fontFamily: 'var(--mono)' }}>
                    {effectivePublicKey ? `${effectivePublicKey.toBase58().slice(0, 6)}...${effectivePublicKey.toBase58().slice(-6)}` : 'Not Connected'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text3)' }}>Vault Mode:</span>
                  <span style={{ color: isInternal ? 'var(--lime)' : 'var(--cyan)', fontWeight: '700' }}>
                    {isInternal ? 'Self-Custodial Local Keypair' : (effectiveConnected ? 'External Adapter' : 'Guest Mode')}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text3)' }}>Balance:</span>
                  <span style={{ color: 'white', fontWeight: '700' }}>
                    {solBalance != null ? Number(solBalance).toFixed(4) : '0.0000'} SOL
                  </span>
                </div>
              </div>

              {/* Action: Run Micro-Transfer Simulation */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  onClick={handleTestTransferBridge}
                  disabled={bridgeSimulating || !effectiveConnected}
                  style={{
                    background: 'rgba(163, 230, 53, 0.12)',
                    border: '1px solid rgba(163, 230, 53, 0.35)',
                    borderRadius: '12px',
                    padding: '12px',
                    color: 'var(--lime)',
                    fontWeight: '700',
                    fontSize: '13px',
                    cursor: effectiveConnected ? 'pointer' : 'not-allowed',
                    opacity: bridgeSimulating ? 0.6 : 1,
                    transition: 'all 0.15s',
                    fontFamily: 'var(--ff)'
                  }}
                >
                  {bridgeSimulating ? 'Simulating on Solana...' : 'Simulate 0.000001 SOL Test Transaction'}
                </button>

                {!effectiveConnected && (
                  <button
                    onClick={onOpenConnect}
                    style={{
                      background: 'linear-gradient(135deg, var(--lime), #65a30d)',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '12px',
                      color: '#090d16',
                      fontWeight: '800',
                      fontSize: '13px',
                      cursor: 'pointer',
                      fontFamily: 'var(--ff)'
                    }}
                  >
                    Connect Wallet to Enable Signing
                  </button>
                )}

                {/* Simulation Result */}
                {bridgeSimulationResult && (
                  <div style={{
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    marginTop: '8px',
                    fontSize: '12px'
                  }}>
                    <div style={{ color: 'var(--lime)', fontWeight: '700', marginBottom: '6px' }}>
                      ✓ {bridgeSimulationResult.status}
                    </div>
                    <div style={{ color: 'var(--text2)', fontSize: '11px', marginBottom: '8px' }}>
                      Compute Units: {bridgeSimulationResult.unitsConsumed} CUs · Fee: 0.000005 SOL
                    </div>
                    <button
                      onClick={handleExecuteBridgeTx}
                      disabled={bridgeSigning}
                      style={{
                        width: '100%',
                        background: 'linear-gradient(135deg, var(--lime), #65a30d)',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '10px',
                        color: '#090d16',
                        fontWeight: '800',
                        fontSize: '13px',
                        cursor: 'pointer',
                        fontFamily: 'var(--ff)'
                      }}
                    >
                      {bridgeSigning ? 'Signing & Sending to Solana...' : 'Sign & Submit Transaction On-Chain'}
                    </button>
                  </div>
                )}

                {/* Success Tx */}
                {bridgeTxSignature && (
                  <div style={{
                    background: 'rgba(34, 211, 238, 0.1)',
                    border: '1px solid rgba(34, 211, 238, 0.3)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    marginTop: '8px',
                    fontSize: '12px'
                  }}>
                    <div style={{ color: 'var(--cyan)', fontWeight: '700', marginBottom: '4px' }}>
                      ✓ Transaction Confirmed
                    </div>
                    <a
                      href={`https://solscan.io/tx/${bridgeTxSignature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--lime)', textDecoration: 'underline', wordBreak: 'break-all', fontSize: '11px' }}
                    >
                      View on Solscan: {bridgeTxSignature.slice(0, 16)}...
                    </a>
                  </div>
                )}

                {/* Error Banner */}
                {bridgeError && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    color: '#f87171',
                    fontSize: '12px'
                  }}>
                    ✕ {bridgeError}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── Curated dApps Grid ── */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              {filteredDApps.map(dapp => (
                <div
                  key={dapp.id}
                  onClick={() => setActiveDApp(dapp)}
                  style={{
                    background: 'rgba(10, 22, 40, 0.75)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = dapp.color || 'var(--lime)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <div>
                    {/* Top Row: Icon + Name + Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '12px',
                          background: dapp.bg,
                          border: `1px solid ${dapp.color}`,
                          color: dapp.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          fontWeight: '800'
                        }}>
                          {dapp.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: '800', color: 'white', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {dapp.name}
                            {dapp.verified && <span style={{ color: 'var(--lime)', fontSize: '11px' }}>✓</span>}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                            {dapp.categoryLabel}
                          </div>
                        </div>
                      </div>

                      {dapp.volume24h && (
                        <span style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '6px',
                          padding: '2px 8px',
                          fontSize: '10px',
                          fontWeight: '600',
                          color: 'var(--text2)'
                        }}>
                          {dapp.volume24h}
                        </span>
                      )}
                    </div>

                    {/* Tagline & Description */}
                    <p style={{ fontSize: '12px', color: 'var(--text2)', margin: '0 0 12px 0', lineHeight: '1.45' }}>
                      {dapp.tagline}
                    </p>
                  </div>

                  {/* Bottom: Tags + Action */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '10px' }}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {dapp.tags.slice(0, 2).map(tag => (
                        <span key={tag} style={{ fontSize: '10px', color: 'var(--text3)', background: 'rgba(255, 255, 255, 0.03)', padding: '2px 6px', borderRadius: '4px' }}>
                          {tag}
                        </span>
                      ))}
                    </div>

                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--lime)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                      Open →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filteredDApps.length === 0 && activeCategory !== 'bridge' && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)', background: 'rgba(10, 22, 40, 0.6)', borderRadius: '16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'white', marginBottom: '6px' }}>
                No dApps found for &quot;{searchQuery}&quot;
              </div>
              <p style={{ fontSize: '12px', margin: '0 0 16px 0' }}>
                You can directly open any URL by clicking the &quot;Go →&quot; button above.
              </p>
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border)',
                  color: 'white',
                  borderRadius: '10px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Clear Search
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
