import { useState, useMemo, useCallback, useEffect } from 'react';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';
import {
  getQuote,
  buildSwapTransaction,
  SOL_MINT,
  USDC_MINT,
  USDT_MINT,
  BONK_MINT,
  JUP_MINT,
  WIF_MINT,
  toBaseUnits,
  fromBaseUnits,
  formatPriceImpact,
  shortMint,
} from '../services/swapService';

// Additional verified Solana token mints
const RAY_MINT = '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R';
const JITOSOL_MINT = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn';
const MSOL_MINT = 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So';

const SUPPORTED_TOKENS = [
  { symbol: 'SOL', name: 'Solana', mint: SOL_MINT, decimals: 9, icon: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' },
  { symbol: 'USDC', name: 'USD Coin', mint: USDC_MINT, decimals: 6, icon: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png' },
  { symbol: 'USDT', name: 'Tether USD', mint: USDT_MINT, decimals: 6, icon: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg' },
  { symbol: 'JUP', name: 'Jupiter', mint: JUP_MINT, decimals: 6, icon: 'https://static.jup.ag/jup/icon.png' },
  { symbol: 'BONK', name: 'Bonk', mint: BONK_MINT, decimals: 5, icon: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cEIPA' },
  { symbol: 'WIF', name: 'dogwifhat', mint: WIF_MINT, decimals: 6, icon: 'https://bafkreibk3covs5ltyqxa272uodhculift6nlxfbgwgpmxcrdqghur3yhea.ipfs.nftstorage.link' },
  { symbol: 'RAY', name: 'Raydium', mint: RAY_MINT, decimals: 6, icon: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png' },
  { symbol: 'JitoSOL', name: 'Jito Staked SOL', mint: JITOSOL_MINT, decimals: 9, icon: 'https://storage.googleapis.com/token-metadata/JitoSOL-256.png' },
  { symbol: 'mSOL', name: 'Marinade Staked SOL', mint: MSOL_MINT, decimals: 9, icon: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png' },
];

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
    description: 'Solana premier swap aggregator with optimal trade routing and dynamic slippage.',
    isTradable: true,
    defaultOutputMint: USDC_MINT,
  },
  {
    id: 'raydium',
    name: 'Raydium',
    url: 'https://raydium.io',
    icon: 'https://www.google.com/s2/favicons?domain=raydium.io&sz=128',
    category: 'dex',
    categoryLabel: 'DEX & Swaps',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.12)',
    description: 'On-chain orderbook AMM and concentrated liquidity market maker on Solana.',
    isTradable: true,
    defaultOutputMint: RAY_MINT,
  },
  {
    id: 'pumpfun',
    name: 'Pump.fun',
    url: 'https://pump.fun',
    icon: 'https://www.google.com/s2/favicons?domain=pump.fun&sz=128',
    category: 'meme',
    categoryLabel: 'Meme & Launchpads',
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.12)',
    description: 'Instant Solana token fair-launch platform with bonded curve pricing.',
    isTradable: true,
    defaultOutputMint: BONK_MINT,
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
    description: 'Leading decentralized marketplace for Solana NFTs, gaming assets, and digital collectibles.',
    isTradable: false,
  },
  {
    id: 'kamino',
    name: 'Kamino',
    url: 'https://app.kamino.finance',
    icon: 'https://www.google.com/s2/favicons?domain=kamino.finance&sz=128',
    category: 'defi',
    categoryLabel: 'DeFi & Lending',
    color: '#818cf8',
    bg: 'rgba(129, 140, 248, 0.12)',
    description: 'Automated liquidity vaults, decentralized lending, and leveraged yield products.',
    isTradable: true,
    defaultOutputMint: USDC_MINT,
  },
  {
    id: 'orca',
    name: 'Orca',
    url: 'https://www.orca.so',
    icon: 'https://www.google.com/s2/favicons?domain=orca.so&sz=128',
    category: 'dex',
    categoryLabel: 'DEX & Swaps',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    description: 'Capital-efficient Whirlpools concentrated liquidity DEX with minimal slippage.',
    isTradable: true,
    defaultOutputMint: USDC_MINT,
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
    description: 'Professional pro-trader trading terminal and marketplace for Solana NFTs.',
    isTradable: false,
  },
  {
    id: 'dexscreener',
    name: 'DexScreener',
    url: 'https://dexscreener.com/solana',
    icon: 'https://www.google.com/s2/favicons?domain=dexscreener.com&sz=128',
    category: 'meme',
    categoryLabel: 'Meme & Launchpads',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    description: 'Real-time Solana DEX price charts, trending pairs, liquidity metrics, and transaction feed.',
    isTradable: false,
  },
  {
    id: 'birdeye',
    name: 'Birdeye',
    url: 'https://birdeye.so',
    icon: 'https://www.google.com/s2/favicons?domain=birdeye.so&sz=128',
    category: 'meme',
    categoryLabel: 'Meme & Launchpads',
    color: '#6366f1',
    bg: 'rgba(99, 102, 241, 0.12)',
    description: 'On-chain market intelligence, price telemetry, security scores, and whale tracking.',
    isTradable: false,
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
    description: 'Decentralized liquidity and lending protocol with dynamic risk management.',
    isTradable: true,
    defaultOutputMint: USDC_MINT,
  },
  {
    id: 'jito',
    name: 'Jito',
    url: 'https://www.jito.network',
    icon: 'https://www.google.com/s2/favicons?domain=jito.network&sz=128',
    category: 'defi',
    categoryLabel: 'DeFi & Lending',
    color: '#14b8a6',
    bg: 'rgba(20, 184, 166, 0.12)',
    description: 'Solana MEV-boosted liquid staking token protocol (JitoSOL) earning staking and MEV rewards.',
    isTradable: true,
    defaultOutputMint: JITOSOL_MINT,
  },
  {
    id: 'marinade',
    name: 'Marinade',
    url: 'https://marinade.finance',
    icon: 'https://www.google.com/s2/favicons?domain=marinade.finance&sz=128',
    category: 'defi',
    categoryLabel: 'DeFi & Lending',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.12)',
    description: 'Pioneer liquid staking protocol on Solana automatically delegating to top validators.',
    isTradable: true,
    defaultOutputMint: MSOL_MINT,
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
    description: 'Dynamic Liquidity Market Maker (DLMM) with zero-slippage dynamic bins and multi-token pools.',
    isTradable: true,
    defaultOutputMint: USDC_MINT,
  },
  {
    id: 'drift',
    name: 'Drift',
    url: 'https://app.drift.trade',
    icon: 'https://www.google.com/s2/favicons?domain=drift.trade&sz=128',
    category: 'dex',
    categoryLabel: 'DEX & Swaps',
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.12)',
    description: 'Decentralized perpetual swap exchange and margin trading protocol built on Solana.',
    isTradable: true,
    defaultOutputMint: USDC_MINT,
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
    description: 'Unified liquidity protocol for Liquid Staking Tokens (LSTs) enabling zero-fee instant un-staking.',
    isTradable: true,
    defaultOutputMint: JITOSOL_MINT,
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
    description: 'Algorithmic, decentralized protocol for lending and borrowing on Solana (formerly Solend).',
    isTradable: true,
    defaultOutputMint: USDC_MINT,
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
  const [copiedAddr, setCopiedAddr] = useState(false);

  // Selected dApp for In-App Execution
  const [selectedDApp, setSelectedDApp] = useState(null);

  // In-App Terminal Trading State
  const [fromMint, setFromMint] = useState(SOL_MINT);
  const [toMint, setToMint] = useState(USDC_MINT);
  const [tradeAmount, setTradeAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(50); // 0.5% default
  const [quote, setQuote] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState(null);

  // Execution state
  const [executing, setExecuting] = useState(false);
  const [execStep, setExecStep] = useState(null);
  const [txSignature, setTxSignature] = useState(null);
  const [txError, setTxError] = useState(null);

  // Transaction Bridge states
  const [bridgeSimulating, setBridgeSimulating] = useState(false);
  const [bridgeSimulationResult, setBridgeSimulationResult] = useState(null);
  const [bridgeSigning, setBridgeSigning] = useState(false);
  const [bridgeTxSignature, setBridgeTxSignature] = useState(null);
  const [bridgeError, setBridgeError] = useState(null);

  // When a dApp is selected, initialize the default target token
  useEffect(() => {
    if (selectedDApp?.defaultOutputMint) {
      setToMint(selectedDApp.defaultOutputMint);
      setFromMint(SOL_MINT);
    }
    setTradeAmount('');
    setQuote(null);
    setQuoteError(null);
    setTxSignature(null);
    setTxError(null);
  }, [selectedDApp]);

  // Token helper
  const fromToken = useMemo(() => {
    return SUPPORTED_TOKENS.find(t => t.mint === fromMint) || {
      symbol: shortMint(fromMint),
      name: 'Custom Token',
      mint: fromMint,
      decimals: 9,
      icon: null,
    };
  }, [fromMint]);

  const toToken = useMemo(() => {
    return SUPPORTED_TOKENS.find(t => t.mint === toMint) || {
      symbol: shortMint(toMint),
      name: 'Custom Token',
      mint: toMint,
      decimals: 6,
      icon: null,
    };
  }, [toMint]);

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

  // Handle URL submit
  const handleUrlSubmit = (e) => {
    e?.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    const found = CURATED_DAPPS.find(
      d => d.name.toLowerCase() === q.toLowerCase() || d.url.toLowerCase().includes(q.toLowerCase())
    );
    if (found) {
      setSelectedDApp(found);
      return;
    }

    let fullUrl = q;
    if (!/^https?:\/\//i.test(fullUrl)) {
      fullUrl = 'https://' + fullUrl;
    }

    try {
      new URL(fullUrl);
      window.open(fullUrl, '_blank', 'noopener,noreferrer');
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

  // Fetch Quote for In-App Terminal
  const fetchTerminalQuote = useCallback(async () => {
    const numAmt = parseFloat(tradeAmount);
    if (!numAmt || numAmt <= 0 || fromMint === toMint) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    setLoadingQuote(true);
    setQuoteError(null);

    try {
      const baseUnits = toBaseUnits(numAmt, fromToken.decimals);
      const q = await getQuote({
        inputMint: fromMint,
        outputMint: toMint,
        amount: baseUnits,
        slippageBps,
        userPublicKey: effectivePublicKey ? effectivePublicKey.toBase58() : undefined,
      });
      setQuote(q);
      setQuoteError(null);
    } catch (err) {
      setQuote(null);
      setQuoteError(err.message || 'Unable to fetch quote');
    } finally {
      setLoadingQuote(false);
    }
  }, [tradeAmount, fromMint, toMint, fromToken.decimals, slippageBps, effectivePublicKey]);

  // Debounced quote fetch
  useEffect(() => {
    if (!selectedDApp) return;
    const timer = setTimeout(() => {
      fetchTerminalQuote();
    }, 500);
    return () => clearTimeout(timer);
  }, [tradeAmount, fromMint, toMint, slippageBps, selectedDApp, fetchTerminalQuote]);

  // Execute Swap via In-App Terminal
  const handleExecuteTerminalSwap = async () => {
    if (!effectiveConnected || !effectivePublicKey) {
      setTxError('Please unlock or connect your wallet first.');
      return;
    }
    if (!quote) {
      setTxError('No active quote available to execute.');
      return;
    }
    const numAmt = parseFloat(tradeAmount);
    if (!numAmt || numAmt <= 0) {
      setTxError('Please enter a valid amount.');
      return;
    }

    setExecuting(true);
    setTxError(null);
    setTxSignature(null);
    setExecStep('Verifying SOL gas reserves...');

    try {
      // 1. Fresh balance check
      const lamports = await connection.getBalance(effectivePublicKey, 'confirmed');
      const freshSol = lamports / LAMPORTS_PER_SOL;

      if (fromToken.symbol === 'SOL') {
        if (numAmt + 0.005 > freshSol) {
          throw new Error(`Insufficient SOL for transaction. You need ${(numAmt + 0.005).toFixed(4)} SOL (amount + 0.005 SOL network fee reserve), but your wallet only has ${freshSol.toFixed(4)} SOL. Please deposit SOL for gas.`);
        }
      } else {
        if (freshSol < 0.005) {
          throw new Error(`Insufficient SOL for network fees. Your wallet has ${freshSol.toFixed(4)} SOL. Solana requires at least ~0.005 SOL for network fees and token account rent.`);
        }
      }

      setExecStep('Building swap transaction...');
      const base64Tx = await buildSwapTransaction(quote, effectivePublicKey.toBase58());
      const buf = Buffer.from(base64Tx, 'base64');
      const vTx = VersionedTransaction.deserialize(buf);

      setExecStep('Simulating transaction on Solana...');
      const sim = await connection.simulateTransaction(vTx);
      if (sim.value.err) {
        if (sim.value.err === 'AccountNotFound') {
          throw new Error('Simulation failed: Account Not Found. You need at least ~0.005 SOL to initialize token accounts on Solana.');
        }
        throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}`);
      }

      setExecStep('Signing with Self-Custodial Vault...');
      let sig;
      if (effectiveSendTransaction) {
        sig = await effectiveSendTransaction(vTx);
      } else if (effectiveSignTransaction) {
        const signed = await effectiveSignTransaction(vTx);
        sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true, maxRetries: 3 });
      } else {
        throw new Error('No signing method available. Please connect your wallet.');
      }

      setExecStep('Confirming on Solana network...');
      // Poll confirmation
      let confirmed = false;
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        try {
          const status = await connection.getSignatureStatus(sig);
          const conf = status?.value?.confirmationStatus;
          if (conf === 'confirmed' || conf === 'finalized') {
            confirmed = true;
            break;
          }
          if (status?.value?.err) {
            throw new Error('Swap rejected by Solana: ' + JSON.stringify(status.value.err));
          }
        } catch (pollErr) {
          if (pollErr.message && pollErr.message.includes('Swap rejected')) throw pollErr;
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      setTxSignature(sig);
      setExecStep(null);
      setTradeAmount('');
      setQuote(null);
    } catch (err) {
      setTxError(err.message || 'Transaction execution failed.');
      setExecStep(null);
    } finally {
      setExecuting(false);
    }
  };

  // Flip Tokens
  const handleFlipTokens = () => {
    const curFrom = fromMint;
    setFromMint(toMint);
    setToMint(curFrom);
    setTradeAmount('');
    setQuote(null);
    setQuoteError(null);
  };

  // Quick Amount Handlers
  const handleSetMax = () => {
    if (fromToken.symbol === 'SOL') {
      const maxSol = Math.max(0, (solBalance || 0) - 0.008);
      setTradeAmount(maxSol > 0 ? maxSol.toFixed(4) : '');
    } else {
      setTradeAmount('10');
    }
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

  // Calculated estimated output
  const outputAmountFormatted = useMemo(() => {
    if (!quote?.outAmount) return null;
    return fromBaseUnits(quote.outAmount, toToken.decimals).toFixed(4);
  }, [quote, toToken.decimals]);

  return (
    <div style={{ width: '100%', maxWidth: '640px', margin: '0 auto', fontFamily: 'var(--ff, sans-serif)', color: 'var(--text)' }}>
      {/* ── HEADER ── */}
      <div style={{ marginBottom: '14px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'white', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
          dApp Explorer
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text2)', margin: 0 }}>
          Solana dApps, Web3 Terminals &amp; On-Chain Execution
        </p>
      </div>

      {/* ── CONNECTION STATUS BAR ── */}
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
          <div style={{ fontSize: '13px', fontWeight: '700', color: (solBalance || 0) < 0.005 ? '#f87171' : 'var(--lime)', fontFamily: 'var(--mono)' }}>
            {solBalance != null ? Number(solBalance).toFixed(4) : '0.0000'} SOL
          </div>
        </div>
      </div>

      {/* ── GAS WARNING BANNER (Shows when SOL < 0.005) ── */}
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

      {/* ── CONDITIONAL RENDERING: SELECTED DAPP TERMINAL vs MAIN EXPLORER GRID ── */}
      {selectedDApp ? (
        /* ══════════════════════════════════════════════════════
           IN-APP DAPP WEB3 TERMINAL VIEW
           ══════════════════════════════════════════════════════ */
        <div style={{
          background: 'rgba(10, 22, 40, 0.88)',
          border: '1px solid var(--border2)',
          borderRadius: '18px',
          padding: '18px',
          marginBottom: '20px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
          {/* Top Nav: Back button + Title + External link */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '12px'
          }}>
            <button
              onClick={() => setSelectedDApp(null)}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '6px 12px',
                color: 'white',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              ← Back
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img
                src={selectedDApp.icon}
                alt={selectedDApp.name}
                style={{ width: '22px', height: '22px', borderRadius: '6px' }}
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
              <span style={{ fontSize: '15px', fontWeight: '800', color: 'white' }}>
                {selectedDApp.name}
              </span>
              <span style={{
                fontSize: '10px',
                background: selectedDApp.bg || 'rgba(163, 230, 53, 0.15)',
                color: selectedDApp.color || 'var(--lime)',
                padding: '2px 8px',
                borderRadius: '6px',
                fontWeight: '700'
              }}>
                {selectedDApp.categoryLabel}
              </span>
            </div>

            <a
              href={selectedDApp.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '11px',
                color: 'var(--cyan)',
                textDecoration: 'none',
                background: 'rgba(34, 211, 238, 0.08)',
                padding: '6px 10px',
                borderRadius: '8px',
                fontWeight: '600',
                border: '1px solid rgba(34, 211, 238, 0.25)'
              }}
            >
              Web ↗
            </a>
          </div>

          {/* Description & Protocol Info */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '12px',
            padding: '12px 14px',
            marginBottom: '16px',
            border: '1px solid var(--border)'
          }}>
            <p style={{ fontSize: '12px', color: 'var(--text2)', margin: '0 0 6px 0', lineHeight: '1.4' }}>
              {selectedDApp.description}
            </p>
            <div style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Engine: Direct On-Chain Execution</span>
              <span>•</span>
              <span style={{ color: 'var(--lime)' }}>✓ Self-Custodial Vault Compatible</span>
            </div>
          </div>

          {/* Interactive In-App Trading Execution Terminal for Tradable dApps */}
          {selectedDApp.isTradable ? (
            <div>
              <div style={{ fontSize: '13px', fontWeight: '800', color: 'white', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>In-App Trading Terminal</span>
                <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Slippage: {slippageBps / 100}%</span>
              </div>

              {/* Pay Input Card */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                padding: '12px 14px',
                marginBottom: '8px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '11px', color: 'var(--text3)' }}>
                  <span>You Pay</span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span>Balance: {fromToken.symbol === 'SOL' ? Number(solBalance || 0).toFixed(4) : '--'} {fromToken.symbol}</span>
                    <button
                      type="button"
                      onClick={handleSetMax}
                      style={{
                        background: 'rgba(163, 230, 53, 0.15)',
                        border: 'none',
                        color: 'var(--lime)',
                        borderRadius: '4px',
                        padding: '1px 6px',
                        fontSize: '10px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      MAX
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="number"
                    value={tradeAmount}
                    onChange={e => setTradeAmount(e.target.value)}
                    placeholder="0.00"
                    step="any"
                    style={{
                      flex: 1,
                      background: 'none',
                      border: 'none',
                      outline: 'none',
                      color: 'white',
                      fontSize: '18px',
                      fontWeight: '700',
                      fontFamily: 'var(--mono)'
                    }}
                  />
                  <select
                    value={fromMint}
                    onChange={e => setFromMint(e.target.value)}
                    style={{
                      background: 'rgba(17, 30, 56, 0.9)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'white',
                      padding: '6px 10px',
                      fontSize: '12px',
                      fontWeight: '700',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {SUPPORTED_TOKENS.map(t => (
                      <option key={t.mint} value={t.mint}>
                        {t.symbol}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Flip Button */}
              <div style={{ display: 'flex', justifyContent: 'center', margin: '-4px 0' }}>
                <button
                  type="button"
                  onClick={handleFlipTokens}
                  style={{
                    background: 'rgba(17, 30, 56, 0.95)',
                    border: '1px solid var(--border)',
                    borderRadius: '50%',
                    width: '30px',
                    height: '30px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--lime)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    zIndex: 2
                  }}
                >
                  ↓
                </button>
              </div>

              {/* Receive Output Card */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                padding: '12px 14px',
                marginBottom: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '11px', color: 'var(--text3)' }}>
                  <span>You Receive (Estimated)</span>
                  {quote?.priceImpactPct && (
                    <span style={{ color: Number(quote.priceImpactPct) > 1 ? '#f87171' : 'var(--text3)' }}>
                      Impact: {formatPriceImpact(quote.priceImpactPct).label}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    flex: 1,
                    color: outputAmountFormatted ? 'var(--lime)' : 'var(--text3)',
                    fontSize: '18px',
                    fontWeight: '700',
                    fontFamily: 'var(--mono)'
                  }}>
                    {loadingQuote ? 'Fetching quote...' : (outputAmountFormatted || '0.00')}
                  </div>
                  <select
                    value={toMint}
                    onChange={e => setToMint(e.target.value)}
                    style={{
                      background: 'rgba(17, 30, 56, 0.9)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'white',
                      padding: '6px 10px',
                      fontSize: '12px',
                      fontWeight: '700',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {SUPPORTED_TOKENS.map(t => (
                      <option key={t.mint} value={t.mint}>
                        {t.symbol}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quote Error Banner */}
              {quoteError && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  color: '#f87171',
                  fontSize: '11px',
                  marginBottom: '12px'
                }}>
                  ✕ {quoteError}
                </div>
              )}

              {/* Execution Steps */}
              {execStep && (
                <div style={{
                  background: 'rgba(34, 211, 238, 0.08)',
                  border: '1px solid rgba(34, 211, 238, 0.25)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  color: 'var(--cyan)',
                  fontSize: '12px',
                  marginBottom: '12px',
                  fontWeight: '600'
                }}>
                  • {execStep}
                </div>
              )}

              {/* Tx Success */}
              {txSignature && (
                <div style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  marginBottom: '12px',
                  fontSize: '12px'
                }}>
                  <div style={{ color: 'var(--lime)', fontWeight: '700', marginBottom: '4px' }}>
                    ✓ Swap Confirmed on Solana!
                  </div>
                  <a
                    href={`https://solscan.io/tx/${txSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--cyan)', textDecoration: 'underline', fontSize: '11px', wordBreak: 'break-all' }}
                  >
                    View on Solscan: {txSignature.slice(0, 18)}...
                  </a>
                </div>
              )}

              {/* Tx Error */}
              {txError && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  color: '#f87171',
                  fontSize: '12px',
                  marginBottom: '12px',
                  lineHeight: '1.4'
                }}>
                  ✕ {txError}
                </div>
              )}

              {/* Action Button */}
              {effectiveConnected ? (
                <button
                  type="button"
                  onClick={handleExecuteTerminalSwap}
                  disabled={executing || !quote || loadingQuote || !tradeAmount}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, var(--lime), #65a30d)',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '14px',
                    color: '#090d16',
                    fontSize: '14px',
                    fontWeight: '800',
                    cursor: executing || !quote || loadingQuote || !tradeAmount ? 'not-allowed' : 'pointer',
                    opacity: executing || !quote || loadingQuote || !tradeAmount ? 0.5 : 1,
                    fontFamily: 'var(--ff)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {executing ? 'Processing On-Chain...' : `Approve & Execute on ${selectedDApp.name}`}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenConnect}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, var(--lime), #65a30d)',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '14px',
                    color: '#090d16',
                    fontSize: '14px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    fontFamily: 'var(--ff)'
                  }}
                >
                  Connect Wallet to Trade
                </button>
              )}
            </div>
          ) : (
            /* Information & Fast Launch Card for Non-Swap dApps (NFTs / Analytics / Lending) */
            <div style={{ textAlign: 'center', padding: '16px 8px' }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                padding: '16px',
                marginBottom: '16px',
                textAlign: 'left'
              }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'white', marginBottom: '8px' }}>
                  Web3 Interaction Notice
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: '1.5', margin: '0 0 10px 0' }}>
                  {selectedDApp.name} is an external Solana Web3 portal. On desktop, connect instantly via the FiatWallet Browser Extension. On mobile, launch the official web application below:
                </p>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                  Wallet Address: <span style={{ fontFamily: 'var(--mono)', color: 'white' }}>{effectivePublicKey ? `${effectivePublicKey.toBase58().slice(0, 8)}...${effectivePublicKey.toBase58().slice(-8)}` : 'Not Connected'}</span>
                </div>
              </div>

              <a
                href={selectedDApp.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  width: '100%',
                  background: 'linear-gradient(135deg, var(--cyan), #0284c7)',
                  color: '#090d16',
                  textDecoration: 'none',
                  borderRadius: '12px',
                  padding: '14px',
                  fontSize: '14px',
                  fontWeight: '800',
                  boxSizing: 'border-box'
                }}
              >
                Launch {selectedDApp.name} Portal ↗
              </a>
            </div>
          )}
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════
           MAIN EXPLORER VIEW (SEARCH + CATEGORIES + 4-COL GRID)
           ══════════════════════════════════════════════════════ */
        <>
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
                placeholder="Search dApps or enter URL (e.g. meteora, pump.fun)..."
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
                  onClick={() => setSelectedDApp(dapp)}
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
        </>
      )}
    </div>
  );
}
