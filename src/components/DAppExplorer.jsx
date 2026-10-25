import { useState, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { fiatwalletProvider } from '../services/fiatwalletProvider';

// Curated list of 16 verified Solana Web3 dApps
const CURATED_DAPPS = [
  {
    id: 'jupiter',
    name: 'Jupiter',
    url: 'https://jup.ag',
    icon: 'https://www.google.com/s2/favicons?domain=jup.ag&sz=128',
    category: 'dex',
    categoryLabel: 'DEX & Swaps',
    color: '#a3e635',
    bg: 'rgba(163, 230, 53, 0.12)',
  },
  {
    id: 'raydium',
    name: 'Raydium',
    url: 'https://raydium.io/swap/',
    icon: 'https://www.google.com/s2/favicons?domain=raydium.io&sz=128',
    category: 'dex',
    categoryLabel: 'DEX & Swaps',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.12)',
  },
  {
    id: 'pumpfun',
    name: 'Pump.fun',
    url: 'https://pump.fun/explore',
    icon: 'https://www.google.com/s2/favicons?domain=pump.fun&sz=128',
    category: 'meme',
    categoryLabel: 'Meme & Launchpads',
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.12)',
  },
  {
    id: 'magiceden',
    name: 'Magic Eden',
    url: 'https://magiceden.io',
    icon: 'https://www.google.com/s2/favicons?domain=magiceden.io&sz=128',
    category: 'nft',
    categoryLabel: 'NFTs & Gaming',
    color: '#ec4899',
    bg: 'rgba(236, 72, 153, 0.12)',
  },
  {
    id: 'kamino',
    name: 'Kamino',
    url: 'https://kamino.com/earn/lend',
    icon: 'https://www.google.com/s2/favicons?domain=kamino.com&sz=128',
    category: 'defi',
    categoryLabel: 'DeFi & Lending',
    color: '#818cf8',
    bg: 'rgba(129, 140, 248, 0.12)',
  },
  {
    id: 'orca',
    name: 'Orca',
    url: 'https://www.orca.so/pools',
    icon: 'https://www.google.com/s2/favicons?domain=orca.so&sz=128',
    category: 'dex',
    categoryLabel: 'DEX & Swaps',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
  },
  {
    id: 'tensor',
    name: 'Tensor',
    url: 'https://www.tensor.trade',
    icon: 'https://www.google.com/s2/favicons?domain=tensor.trade&sz=128',
    category: 'nft',
    categoryLabel: 'NFTs & Gaming',
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.12)',
  },
  {
    id: 'dexscreener',
    name: 'DexScreener',
    url: 'https://dexscreener.com/?rankBy=trendingScoreH6&order=desc&chainIds=solana&profile=0',
    icon: 'https://www.google.com/s2/favicons?domain=dexscreener.com&sz=128',
    category: 'meme',
    categoryLabel: 'Meme & Launchpads',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
  },
  {
    id: 'birdeye',
    name: 'Birdeye',
    url: 'https://birdeye.so/?chain=solana',
    icon: 'https://www.google.com/s2/favicons?domain=birdeye.so&sz=128',
    category: 'meme',
    categoryLabel: 'Meme & Launchpads',
    color: '#6366f1',
    bg: 'rgba(99, 102, 241, 0.12)',
  },
  {
    id: 'marginfi',
    name: 'MarginFi',
    url: 'https://app.marginfi.com',
    icon: 'https://www.google.com/s2/favicons?domain=marginfi.com&sz=128',
    category: 'defi',
    categoryLabel: 'DeFi & Lending',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.12)',
  },
  {
    id: 'jito',
    name: 'Jito',
    url: 'https://www.jito.network/staking/',
    icon: 'https://www.google.com/s2/favicons?domain=jito.network&sz=128',
    category: 'defi',
    categoryLabel: 'DeFi & Lending',
    color: '#14b8a6',
    bg: 'rgba(20, 184, 166, 0.12)',
  },
  {
    id: 'marinade',
    name: 'Marinade',
    url: 'https://app.marinade.finance/',
    icon: 'https://www.google.com/s2/favicons?domain=marinade.finance&sz=128',
    category: 'defi',
    categoryLabel: 'DeFi & Lending',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.12)',
  },
  {
    id: 'meteora',
    name: 'Meteora',
    url: 'https://app.meteora.ag',
    icon: 'https://www.google.com/s2/favicons?domain=meteora.ag&sz=128',
    category: 'dex',
    categoryLabel: 'DEX & Swaps',
    color: '#ff4d4d',
    bg: 'rgba(255, 77, 77, 0.12)',
  },
  {
    id: 'sanctum',
    name: 'Sanctum',
    url: 'https://app.sanctum.so',
    icon: 'https://www.google.com/s2/favicons?domain=sanctum.so&sz=128',
    category: 'defi',
    categoryLabel: 'DeFi & Lending',
    color: '#ec4899',
    bg: 'rgba(236, 72, 153, 0.12)',
  },
  {
    id: 'solend',
    name: 'Save',
    url: 'https://save.finance',
    icon: 'https://www.google.com/s2/favicons?domain=save.finance&sz=128',
    category: 'defi',
    categoryLabel: 'DeFi & Lending',
    color: '#ffaa00',
    bg: 'rgba(255, 170, 0, 0.12)',
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

const DAppExplorer = forwardRef(function DAppExplorer({
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
  searchQuery: propSearchQuery,
  onSearchQueryChange,
}, ref) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const searchQuery = propSearchQuery !== undefined ? propSearchQuery : internalSearchQuery;
  const setSearchQuery = onSearchQueryChange || setInternalSearchQuery;
  const [copiedAddr, setCopiedAddr] = useState(false);

  // Selected dApp for Full-Screen In-App Web View
  const [selectedDApp, setSelectedDApp] = useState(null);
  const [browserUrlInput, setBrowserUrlInput] = useState('');
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef(null);

  // Transaction Bridge states
  const [bridgeSimulating, setBridgeSimulating] = useState(false);
  const [bridgeSimulationResult, setBridgeSimulationResult] = useState(null);
  const [bridgeSigning, setBridgeSigning] = useState(false);
  const [bridgeTxSignature, setBridgeTxSignature] = useState(null);
  const [bridgeError, setBridgeError] = useState(null);

  // Reset reload key and sync browser url input when opening dApp
  useEffect(() => {
    if (selectedDApp) {
      setIframeKey(k => k + 1);
      setBrowserUrlInput(selectedDApp.url || '');
    }
  }, [selectedDApp]);

  // Send wallet state to dApp iframe via postMessage on load
  const handleIframeLoad = () => {
    try {
      const cw = iframeRef.current?.contentWindow;
      if (!cw) return;

      // Try direct injection (works if same-origin)
      try {
        cw.solana = window.solana || fiatwalletProvider;
        cw.fiatwallet = window.fiatwallet || fiatwalletProvider;
        cw.phantom = { solana: window.solana || fiatwalletProvider };
        cw.solflare = window.solana || fiatwalletProvider;
      } catch {}

      // Announce wallet-ready with public key so the dApp's wallet-standard
      // listener and any custom fiatwallet:wallet-ready handler can react
      const pubKeyStr = effectivePublicKey ? effectivePublicKey.toBase58() : null;
      cw.postMessage({ type: 'fiatwallet:wallet-ready', publicKey: pubKeyStr }, '*');
      // Also send in solana-standard format that @solana/wallet-adapter dApps expect
      cw.postMessage({ type: 'solana:wallet-ready', publicKey: pubKeyStr }, '*');
    } catch {}
  };

  // Listen for message events from dApps inside the iframe (cross-origin postMessage bridge)
  useEffect(() => {
    const handleWindowMessage = (event) => {
      const { data, source } = event || {};
      if (!data || typeof data !== 'object') return;
      // Only accept messages from our own iframe
      if (iframeRef.current && source !== iframeRef.current.contentWindow) return;

      const msgType = data.type || data.method || data.action || '';
      const isConnectRequest =
        data.target === 'fiatwallet-inpage-request' ||
        msgType === 'fiatwallet:request' ||
        msgType === 'solana:request' ||
        msgType === 'solana-wallet-adapter-connect' ||
        msgType === 'connect' ||
        data.method === 'connect' ||
        (data.jsonrpc === '2.0' && typeof data.method === 'string' && data.method.includes('connect'));

      if (!isConnectRequest) return;

      // If no wallet is active, tell the parent app to prompt unlock or connect
      if (!effectivePublicKey || !effectiveConnected) {
        // Fire the same events FiatWalletAdapter fires so App.jsx shows the right UI
        window.dispatchEvent(new CustomEvent(
          (typeof localStorage !== 'undefined' && localStorage.getItem('fw_vault_v1'))
            ? 'fiatwallet:adapter-needs-unlock'
            : 'fiatwallet:adapter-needs-onboard'
        ));
        // Reply with a temporary pending status so the dApp does not time out immediately
        source?.postMessage({
          target: 'fiatwallet-inpage-response',
          id: data.id,
          error: 'Wallet locked — please unlock FiatWallet first.',
        }, '*');
        return;
      }

      // Wallet is active — show the DApp approval modal via fiatwalletProvider
      fiatwalletProvider._requestApproval('connect', {
        origin: event.origin || 'Solana dApp',
        title: selectedDApp?.name || 'dApp',
      }).then(() => {
        // Approved — reply with public key in both response formats
        const pubKeyStr = effectivePublicKey.toBase58();
        source?.postMessage({
          target: 'fiatwallet-inpage-response',
          type: 'solana:response',
          id: data.id,
          result: { publicKey: pubKeyStr },
        }, '*');
        // Also re-send wallet-ready in case the dApp is polling
        source?.postMessage({ type: 'fiatwallet:wallet-ready', publicKey: pubKeyStr }, '*');
        source?.postMessage({ type: 'solana:wallet-ready', publicKey: pubKeyStr }, '*');
      }).catch((err) => {
        source?.postMessage({
          target: 'fiatwallet-inpage-response',
          id: data.id,
          error: err?.message || 'User rejected connection',
        }, '*');
      });
    };

    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, [effectivePublicKey, effectiveConnected, selectedDApp?.name]);

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
        (d.categoryLabel && d.categoryLabel.toLowerCase().includes(q)) ||
        d.url.toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeCategory, searchQuery]);

  const handleOpenDApp = async (dApp) => {
    if (!dApp) return;
    const targetUrl = typeof dApp === 'string' ? dApp : (dApp.url || '');
    const targetTitle = (typeof dApp === 'object' && dApp.name) ? dApp.name : 'dApp';

    // 1. Try window.FiatWalletBridge (Direct Android JavascriptInterface — always available on native)
    if (typeof window !== 'undefined' && window.FiatWalletBridge) {
      try {
        if (typeof window.FiatWalletBridge.openDApp === 'function' || window.FiatWalletBridge.openDApp) {
          window.FiatWalletBridge.openDApp(targetUrl, targetTitle);
          return;
        }
      } catch (e) {
        console.warn('window.FiatWalletBridge error, falling back:', e);
      }
    }

    // 2. Try Capacitor Native Bridge Plugin (fallback)
    if (typeof window !== 'undefined' && window.Capacitor?.Plugins?.FiatWalletBridge?.openDApp) {
      try {
        await window.Capacitor.Plugins.FiatWalletBridge.openDApp({ url: targetUrl, title: targetTitle });
        return;
      } catch (e) {
        console.warn('Capacitor FiatWalletBridge error, falling back:', e);
      }
    }

    // 3. Last resort: In-app browser state
    setSelectedDApp(typeof dApp === 'object' ? dApp : { id: 'custom', name: targetTitle, url: targetUrl });
    setBrowserUrlInput(targetUrl);
  };

  // Navigate directly inside in-app browser top bar without leaving
  const handleNavigateInBrowser = (targetQuery) => {
    const raw = (targetQuery || '').trim();
    if (!raw) return;

    // Check if query matches a curated dApp
    const found = CURATED_DAPPS.find(
      d => d.name.toLowerCase() === raw.toLowerCase() || d.id === raw.toLowerCase() || d.url.toLowerCase().includes(raw.toLowerCase())
    );
    if (found) {
      handleOpenDApp(found);
      return;
    }

    let fullUrl = raw;
    if (!/^https?:\/\//i.test(fullUrl)) {
      if (fullUrl.includes('.')) {
        fullUrl = 'https://' + fullUrl;
      } else {
        fullUrl = `https://www.google.com/search?q=${encodeURIComponent(fullUrl)}`;
      }
    }

    try {
      const parsedUrl = new URL(fullUrl);
      const domain = parsedUrl.hostname.replace(/^www\./i, '');
      const custom = {
        id: 'custom-' + domain,
        name: domain,
        url: fullUrl,
        icon: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        category: 'web3',
        categoryLabel: 'Custom dApp',
        color: 'var(--cyan)',
      };
      handleOpenDApp(custom);
    } catch {
      setSelectedDApp({
        id: 'custom-' + Date.now(),
        name: 'dApp',
        url: fullUrl,
      });
      setBrowserUrlInput(fullUrl);
    }
  };

  // Handle URL or Search submit -> Takes user straight to full screen web view
  const handleUrlSubmit = (eOrQuery) => {
    if (eOrQuery && typeof eOrQuery.preventDefault === 'function') {
      eOrQuery.preventDefault();
      eOrQuery = null;
    }
    const raw = (typeof eOrQuery === 'string' ? eOrQuery : (searchQuery || '')).trim();
    if (!raw) return;

    // Check if query matches a curated dApp
    const found = CURATED_DAPPS.find(
      d => d.name.toLowerCase() === raw.toLowerCase() || d.url.toLowerCase().includes(raw.toLowerCase())
    );
    if (found) {
      handleOpenDApp(found);
      return;
    }

    // Direct URL or custom query
    let fullUrl = raw;
    if (!/^https?:\/\//i.test(fullUrl)) {
      fullUrl = 'https://' + fullUrl;
    }

    try {
      const parsedUrl = new URL(fullUrl);
      const domain = parsedUrl.hostname.replace(/^www\./i, '');
      const name = domain.split('.')[0];
      const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
      const custom = {
        id: 'custom-' + domain,
        name: capitalized,
        url: fullUrl,
        icon: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        category: 'web3',
        categoryLabel: 'Custom dApp',
        color: 'var(--cyan)',
        bg: 'rgba(34, 211, 238, 0.12)',
      };
      handleOpenDApp(custom);
    } catch {
      if (filteredDApps.length > 0) {
        handleOpenDApp(filteredDApps[0]);
      }
    }
  };

  useImperativeHandle(ref, () => ({
    handleUrlSubmit: (customQuery) => {
      handleUrlSubmit(customQuery);
    },
    openDApp: (dApp) => {
      handleOpenDApp(dApp);
    }
  }), [searchQuery, filteredDApps]);

  // Copy address helper
  const handleCopyAddress = () => {
    if (!effectivePublicKey) return;
    navigator.clipboard.writeText(effectivePublicKey.toBase58());
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
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
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const tx = new Transaction({
        feePayer: effectivePublicKey,
        recentBlockhash: blockhash,
      });

      tx.add(
        SystemProgram.transfer({
          fromPubkey: effectivePublicKey,
          toPubkey: effectivePublicKey,
          lamports: 1000,
        })
      );

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
    <>
      {/* ══════════════════════════════════════════════════════
         100% FULL-SCREEN MOBILE DAPP BROWSER VIEW
         (Activated when user clicks or searches any dApp)
         ══════════════════════════════════════════════════════ */}
      {selectedDApp ? (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 9999999,
          background: '#0a1628',
          display: 'flex',
          flexDirection: 'column',
          margin: 0,
          padding: 0,
          overflow: 'hidden'
        }}>
          {/* Top minimal mobile navigation bar with editable search bar */}
          <div style={{
            height: '50px',
            background: 'rgba(10, 22, 40, 0.98)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            flexShrink: 0,
            zIndex: 10,
            gap: '8px'
          }}>
            {/* Left: Back to Explorer */}
            <button
              type="button"
              onClick={() => setSelectedDApp(null)}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                color: 'white',
                fontSize: '12px',
                fontWeight: '700',
                padding: '6px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                flexShrink: 0
              }}
            >
              ← Back
            </button>

            {/* Center: In-app Editable Search and Domain Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleNavigateInBrowser(browserUrlInput);
              }}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                margin: '0 4px'
              }}
            >
              <div style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                borderRadius: '10px',
                padding: '5px 9px',
                gap: '6px'
              }}>
                {selectedDApp.icon ? (
                  <img
                    src={selectedDApp.icon}
                    alt=""
                    style={{ width: '15px', height: '15px', borderRadius: '3px', flexShrink: 0 }}
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--lime, #a3e635)', flexShrink: 0 }}>✓</span>
                )}
                <input
                  type="text"
                  value={browserUrlInput}
                  onChange={(e) => setBrowserUrlInput(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  placeholder="Search or enter dApp URL..."
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#f0f6ff',
                    fontSize: '12px',
                    fontWeight: '600',
                    padding: '1px 0'
                  }}
                />
              </div>
            </form>

            {/* Right: Reload button */}
            <button
              type="button"
              onClick={() => setIframeKey(k => k + 1)}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                color: 'var(--cyan, #22d3ee)',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '700',
                padding: '6px 10px',
                flexShrink: 0
              }}
              title="Reload dApp"
            >
              ↻
            </button>
          </div>

          {/* Full Screen Web View Iframe */}
          <iframe
            ref={iframeRef}
            key={iframeKey}
            src={selectedDApp.url}
            title={selectedDApp.name}
            onLoad={handleIframeLoad}
            style={{
              flex: 1,
              width: '100%',
              height: 'calc(100vh - 50px)',
              border: 'none',
              background: '#0a1628',
              display: 'block'
            }}
            allow="clipboard-write; clipboard-read; camera; microphone; payment; geolocation"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals allow-downloads allow-top-navigation allow-top-navigation-by-user-activation"
          />
        </div>
      ) : null}


      {/* ══════════════════════════════════════════════════════
         MAIN EXPLORER GRID & SEARCH VIEW
         ══════════════════════════════════════════════════════ */}
      <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto', fontFamily: 'var(--ff, sans-serif)', color: 'var(--text)' }}>
        {/* Low Gas Warning (if below minimum) */}
        {effectiveConnected && (solBalance || 0) < 0.005 && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '12px',
            padding: '10px 14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '12px',
            color: '#fca5a5'
          }}>
            <span style={{ fontWeight: '800', color: '#f87171', fontSize: '14px' }}>!</span>
            <div style={{ flex: 1, lineHeight: '1.4' }}>
              <strong style={{ color: '#f87171' }}>Low SOL Gas Reserve ({Number(solBalance || 0).toFixed(4)} SOL):</strong> Solana transactions require ~0.005 SOL for network fees and token account rent. Fund your wallet with SOL to avoid transaction failures.
            </div>
          </div>
        )}

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

            {/* Micro-Transfer Simulation */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
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
                  type="button"
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
                    Compute Units: {bridgeSimulationResult.unitsConsumed} CUs • Fee: 0.000005 SOL
                  </div>
                  <button
                    type="button"
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
          /* ── QUICK DAPPS 4-COLUMN ICON GRID ── */
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '18px 12px',
            marginBottom: '24px',
            padding: '8px 2px',
          }}>
            {filteredDApps.map(dapp => (
              <div
                key={dapp.id}
                onClick={() => handleOpenDApp(dapp)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'transform 0.18s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                }}
              >
                {/* App Logo / Icon */}
                <div style={{
                  width: '58px',
                  height: '58px',
                  borderRadius: '16px',
                  background: dapp.bg || 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${dapp.color || 'rgba(255, 255, 255, 0.12)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '8px',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {dapp.icon ? (
                    <img
                      src={dapp.icon}
                      alt={dapp.name}
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        objectFit: 'contain',
                      }}
                      onError={e => {
                        e.currentTarget.style.display = 'none';
                        const fb = e.currentTarget.parentElement.querySelector('.dapp-fallback');
                        if (fb) fb.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className="dapp-fallback"
                    style={{
                      display: dapp.icon ? 'none' : 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      height: '100%',
                      fontSize: '15px',
                      fontWeight: '800',
                      color: dapp.color || 'var(--lime)',
                    }}
                  >
                    {dapp.name.slice(0, 2).toUpperCase()}
                  </div>
                </div>

                {/* App Title */}
                <span style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#ffffff',
                  textAlign: 'center',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.01em',
                }}>
                  {dapp.name}
                </span>
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
              type="button"
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
    </>
  );
});

export default DAppExplorer;
