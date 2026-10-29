import { getEffectiveRelayerPublicKey } from './pajcashService';
import { logP2PTransaction } from './supabase';

const NEAR_INTENTS_BASE_URL = 'https://1click.chaindefuser.com/v0';

let cachedApiKey = null;

export function setNearIntentsApiKey(key) {
  if (key) {
    cachedApiKey = key;
    try {
      localStorage.setItem('near_intents_api_key', key);
    } catch (_) {}
  }
}

export function getNearIntentsApiKey() {
  return (
    cachedApiKey ||
    import.meta.env.VITE_NEAR_INTENTS_API_KEY ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('near_intents_api_key') : null) ||
    ''
  );
}

export const LOGOS = {
  solana: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
  btc: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png',
  eth: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  base: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
  bsc: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png',
  arb: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
  tron: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
  pol: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
  usdt: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
  usdc: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png',
};

export const SUPPORTED_CHAINS = [
  { id: 'solana', name: 'Solana', badge: 'SOL', isDefault: true, logo: LOGOS.solana },
  { id: 'btc', name: 'Bitcoin', badge: 'BTC', logo: LOGOS.btc },
  { id: 'base', name: 'Base', badge: 'BASE', logo: LOGOS.base },
  { id: 'arb', name: 'Arbitrum', badge: 'ARB', logo: LOGOS.arb },
  { id: 'eth', name: 'Ethereum', badge: 'ETH', logo: LOGOS.eth },
  { id: 'tron', name: 'Tron', badge: 'TRX', logo: LOGOS.tron },
  { id: 'pol', name: 'Polygon', badge: 'POL', logo: LOGOS.pol },
  { id: 'bsc', name: 'BNB Chain', badge: 'BSC', logo: LOGOS.bsc },
];

export const SOLANA_DESTINATIONS = [
  {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    assetId: 'nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near',
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    logo: LOGOS.usdt,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    logo: LOGOS.usdc,
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    assetId: 'nep141:sol.omft.near',
    mint: 'So11111111111111111111111111111111111111112',
    logo: LOGOS.solana,
  },
];

export const CHAIN_TOKENS = {
  btc: [
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      decimals: 8,
      assetId: 'nep141:btc.omft.near',
      min: '0.0002',
      defaultAmount: '0.0002',
      estMinReceive: '15.47',
      logo: LOGOS.btc,
    },
  ],
  base: [
    {
      symbol: 'USDC',
      name: 'USD Coin (Base)',
      decimals: 6,
      assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
      min: '2',
      defaultAmount: '2',
      estMinReceive: '1.62',
      logo: LOGOS.usdc,
    },
    {
      symbol: 'ETH',
      name: 'Ethereum (Base)',
      decimals: 18,
      assetId: 'nep141:base.omft.near',
      min: '0.001',
      defaultAmount: '0.001',
      estMinReceive: '1.93',
      logo: LOGOS.eth,
    },
  ],
  arb: [
    {
      symbol: 'USDC',
      name: 'USD Coin (Arbitrum)',
      decimals: 6,
      assetId: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
      min: '2',
      defaultAmount: '2',
      estMinReceive: '1.62',
      logo: LOGOS.usdc,
    },
    {
      symbol: 'ETH',
      name: 'Ethereum (Arbitrum)',
      decimals: 18,
      assetId: 'nep141:arb.omft.near',
      min: '0.001',
      defaultAmount: '0.001',
      estMinReceive: '1.93',
      logo: LOGOS.eth,
    },
  ],
  eth: [
    {
      symbol: 'USDT',
      name: 'Tether USD (ERC20)',
      decimals: 6,
      assetId: 'nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near',
      min: '10',
      defaultAmount: '10',
      estMinReceive: '9.53',
      logo: LOGOS.usdt,
    },
    {
      symbol: 'USDC',
      name: 'USD Coin (ERC20)',
      decimals: 6,
      assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
      min: '10',
      defaultAmount: '10',
      estMinReceive: '9.54',
      logo: LOGOS.usdc,
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      assetId: 'nep141:eth.omft.near',
      min: '0.005',
      defaultAmount: '0.005',
      estMinReceive: '11.11',
      logo: LOGOS.eth,
    },
  ],
  tron: [
    {
      symbol: 'USDT',
      name: 'Tether USD (TRC20)',
      decimals: 6,
      assetId: 'nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near',
      min: '105',
      defaultAmount: '105',
      estMinReceive: '103.20',
      logo: LOGOS.usdt,
    },
    {
      symbol: 'TRX',
      name: 'Tron',
      decimals: 6,
      assetId: 'nep141:tron.omft.near',
      min: '350',
      defaultAmount: '350',
      estMinReceive: '113.80',
      logo: LOGOS.tron,
    },
  ],
  pol: [
    {
      symbol: 'USDC',
      name: 'USD Coin (Polygon)',
      decimals: 6,
      assetId: 'nep245:v2_1.omni.hot.tg:137_qiStmoQJDQPTebaPjgx5VBxZv6L',
      min: '2',
      defaultAmount: '2',
      estMinReceive: '1.62',
      logo: LOGOS.usdc,
    },
    {
      symbol: 'USDT',
      name: 'Tether USD (Polygon)',
      decimals: 6,
      assetId: 'nep245:v2_1.omni.hot.tg:137_3hpYoaLtt8MP1Z2GH1U473DMRKgr',
      min: '2',
      defaultAmount: '2',
      estMinReceive: '1.62',
      logo: LOGOS.usdt,
    },
    {
      symbol: 'POL',
      name: 'Polygon (POL)',
      decimals: 18,
      assetId: 'nep245:v2_1.omni.hot.tg:137_11111111111111111111',
      min: '10',
      defaultAmount: '10',
      estMinReceive: '0.50',
      logo: LOGOS.pol,
    },
  ],
  bsc: [
    {
      symbol: 'USDT',
      name: 'Tether USD (BSC)',
      decimals: 18,
      assetId: 'nep245:v2_1.omni.hot.tg:56_2CMMyVTGZkeyNZTSvS5sarzfir6g',
      min: '1000',
      defaultAmount: '1000',
      estMinReceive: '992.50',
      logo: LOGOS.usdt,
    },
    {
      symbol: 'USDC',
      name: 'USD Coin (BSC)',
      decimals: 18,
      assetId: 'nep245:v2_1.omni.hot.tg:56_2w93GqMcEmQFDru84j3HZZWt557r',
      min: '1000',
      defaultAmount: '1000',
      estMinReceive: '992.50',
      logo: LOGOS.usdc,
    },
    {
      symbol: 'BNB',
      name: 'BNB',
      decimals: 18,
      assetId: 'nep245:v2_1.omni.hot.tg:56_11111111111111111111',
      min: '2',
      defaultAmount: '2',
      estMinReceive: '1450.15',
      logo: LOGOS.bsc,
    },
  ],
};

export function isValidRefundAddress(address, chainId) {
  if (!address || typeof address !== 'string') return false;
  const clean = address.trim();
  if (chainId === 'btc') {
    return /^(bc1[a-z0-9]{39,59}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i.test(clean);
  }
  if (chainId === 'tron') {
    return /^T[a-km-zA-HJ-NP-Z1-9]{33}$/.test(clean);
  }
  // EVM chains: Base, Arb, ETH, BSC, Polygon
  return /^0x[a-fA-F0-9]{40}$/.test(clean);
}

let remoteBridgeRefunds = { btc: '', evm: '', tron: '' };

export async function fetchRemoteBridgeConfig() {
  try {
    const isCapacitorOrLocal = typeof window !== 'undefined' && (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:'
    );
    const endpoints = isCapacitorOrLocal
      ? ['https://fiatwallet.app/api/paj_config', '/api/paj_config']
      : ['/api/paj_config', 'https://fiatwallet.app/api/paj_config'];

    for (const ep of endpoints) {
      const res = await fetch(ep).catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data) {
          if (data.nearIntentsApiKey) {
            setNearIntentsApiKey(data.nearIntentsApiKey);
          }
          if (data.bridgeRefundBtc) {
            remoteBridgeRefunds.btc = data.bridgeRefundBtc.trim();
            try { localStorage.setItem('bridge_refund_btc', remoteBridgeRefunds.btc); } catch (_) {}
          }
          if (data.bridgeRefundEvm) {
            remoteBridgeRefunds.evm = data.bridgeRefundEvm.trim();
            try { localStorage.setItem('bridge_refund_evm', remoteBridgeRefunds.evm); } catch (_) {}
          }
          if (data.bridgeRefundTron) {
            remoteBridgeRefunds.tron = data.bridgeRefundTron.trim();
            try { localStorage.setItem('bridge_refund_tron', remoteBridgeRefunds.tron); } catch (_) {}
          }
          return;
        }
      }
    }
  } catch (_) {}
}

if (typeof window !== 'undefined') {
  fetchRemoteBridgeConfig().catch(() => {});
}

export function getDefaultRefundAddress(chainId) {
  if (chainId === 'btc') {
    return (
      (remoteBridgeRefunds.btc && remoteBridgeRefunds.btc.trim()) ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('bridge_refund_btc') : null) ||
      import.meta.env.VITE_BRIDGE_REFUND_BTC_ADDRESS ||
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    );
  }
  if (chainId === 'tron') {
    return (
      (remoteBridgeRefunds.tron && remoteBridgeRefunds.tron.trim()) ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('bridge_refund_tron') : null) ||
      import.meta.env.VITE_BRIDGE_REFUND_TRON_ADDRESS ||
      'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
    );
  }
  return (
    (remoteBridgeRefunds.evm && remoteBridgeRefunds.evm.trim()) ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('bridge_refund_evm') : null) ||
    import.meta.env.VITE_BRIDGE_REFUND_EVM_ADDRESS ||
    '0x0000000000000000000000000000000000000001'
  );
}

export function isTreasuryRefundConfigured(chainId) {
  const addr = getDefaultRefundAddress(chainId);
  return (
    Boolean(addr) &&
    addr !== '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' &&
    addr !== 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb' &&
    addr !== '0x0000000000000000000000000000000000000001'
  );
}

function formatUnits(amountFloat, decimals) {
  const parts = String(amountFloat).split('.');
  const whole = parts[0] || '0';
  let fraction = parts[1] || '';
  if (fraction.length > decimals) {
    fraction = fraction.slice(0, decimals);
  } else {
    fraction = fraction.padEnd(decimals, '0');
  }
  const combined = `${whole}${fraction}`.replace(/^0+/, '') || '0';
  return combined;
}

/**
 * Synchronous instant check for cached deposit address.
 * Eliminates screen delay when switching between previously viewed tokens/chains.
 */
export function getCachedBridgeDeposit(userAddress, chain, tokenSymbol, refundTo = '') {
  if (typeof localStorage === 'undefined' || !userAddress || !chain || !tokenSymbol) return null;
  const validRefund = refundTo && isValidRefundAddress(refundTo, chain) ? `_${refundTo.trim()}` : '';
  const cacheKey = `fw_bridge_addr_${userAddress}_${chain}_${tokenSymbol}${validRefund}`;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ageHours = (Date.now() - (parsed.createdAt || 0)) / (1000 * 60 * 60);
    if (ageHours < 48 && parsed.depositAddress && parsed.status !== 'COMPLETED') {
      // Backwards-compatible hydration for fees and minimum guaranteed net receive
      if (!parsed.nearFee) {
        parsed.nearFee = '0.27';
      }
      if (parsed.minNetReceived == null) {
        const rawOut = parsed.grossOut || parsed.netReceived || 0;
        const isUsd = (parsed.destinationSymbol || 'USDT').includes('USD');
        const minGross = rawOut * 0.99;
        const fee = isUsd ? Math.max(0.10, Math.round(minGross * 0.004 * 100) / 100) : minGross * 0.004;
        parsed.minNetReceived = Math.max(0, minGross - fee);
      }
      return parsed;
    }
  } catch (_) {}
  return null;
}

/**
 * Generate a real live deposit address for the bridge.
 */
export async function createBridgeDeposit({
  originAsset,
  destinationAsset,
  amountFloat,
  originDecimals = 6,
  destinationSymbol = 'USDT',
  userAddress,
  chainId,
  refundTo,
}) {
  const amountUnits = formatUnits(amountFloat, originDecimals);
  const relayerPubkey = getEffectiveRelayerPublicKey();
  const apiKey = getNearIntentsApiKey();
  const effectiveRefund = refundTo && isValidRefundAddress(refundTo, chainId)
    ? refundTo.trim()
    : getDefaultRefundAddress(chainId);

  const body = {
    dry: false,
    swapType: 'EXACT_INPUT',
    slippageTolerance: 100, // 1%
    originAsset,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset,
    amount: amountUnits,
    refundTo: effectiveRefund,
    refundType: 'ORIGIN_CHAIN',
    recipient: relayerPubkey,
    recipientType: 'DESTINATION_CHAIN',
    deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(`${NEAR_INTENTS_BASE_URL}/quote`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.message || data.error || 'Failed to generate bridge deposit address');
  }

  const depositAddress = data.quote?.depositAddress;
  if (!depositAddress) {
    throw new Error('Bridge did not return a valid deposit address');
  }

  const quote = data.quote || {};
  const rawOut = parseFloat(quote.amountOutFormatted || '0');
  const isUsdToken = destinationSymbol.includes('USD');
  const destDecimals = destinationSymbol === 'SOL' ? 9 : 6;

  // 1. NEAR Network / Routing Fee (withdrawFee is in destination base units)
  let nearFee = 0.27;
  if (quote.withdrawFee) {
    nearFee = parseFloat(quote.withdrawFee) / Math.pow(10, destDecimals);
  } else if (quote.amountInUsd && quote.amountOutUsd) {
    nearFee = Math.max(0, parseFloat(quote.amountInUsd) - parseFloat(quote.amountOutUsd));
  }
  const nearFeeFormatted = nearFee < 0.01 ? nearFee.toFixed(4) : nearFee.toFixed(2);

  // 2. Minimum Guaranteed Gross Output from Solvers (accounting for max slippage)
  let minGrossOut = rawOut * 0.99;
  if (quote.minAmountOut) {
    minGrossOut = parseFloat(quote.minAmountOut) / Math.pow(10, destDecimals);
  }

  // 3. FiatWallet Protocol Fee (0.4% with $0.10 min floor for USD tokens)
  const protocolFee = isUsdToken
    ? Math.max(0.10, Math.round(rawOut * 0.004 * 100) / 100)
    : rawOut * 0.004;

  const minProtocolFee = isUsdToken
    ? Math.max(0.10, Math.round(minGrossOut * 0.004 * 100) / 100)
    : minGrossOut * 0.004;

  const netReceived = Math.max(0, rawOut - protocolFee);
  const minNetReceived = Math.max(0, minGrossOut - minProtocolFee);

  // Log pending order to Supabase
  try {
    await logP2PTransaction({
      signature: `pending_bridge_${depositAddress}`,
      userAddress,
      orderId: depositAddress,
      tokenSymbol: destinationSymbol,
      cryptoAmount: netReceived,
      fiatCurrency: 'USD',
      fiatAmount: netReceived,
      usdValue: quote.amountOutUsd || netReceived,
      status: 'PENDING',
      depositAddress,
      type: 'bridge',
    });
  } catch (err) {
    console.warn('[bridgeService] Failed to log pending bridge to Supabase:', err.message);
  }

  return {
    depositAddress,
    timeEstimate: quote.timeEstimate || 25,
    grossOut: rawOut,
    protocolFee,
    netReceived,
    minGrossOut,
    minNetReceived,
    nearFee: nearFeeFormatted,
    amountInFormatted: quote.amountInFormatted || String(amountFloat),
    amountInUsd: quote.amountInUsd,
    amountOutUsd: quote.amountOutUsd,
    deadline: quote.deadline,
    correlationId: data.correlationId,
    refundTo: effectiveRefund,
  };
}

/**
 * Gets or creates a persistent bridge deposit address so the user sees the same
 * address and QR code if they exit and return.
 */
export async function getOrCreateBridgeDeposit({
  originAsset,
  destinationAsset,
  originDecimals = 6,
  destinationSymbol = 'USDT',
  userAddress,
  chain,
  tokenSymbol,
  defaultAmount = '5',
  forceNew = false,
  refundTo = '',
}) {
  const validRefund = refundTo && isValidRefundAddress(refundTo, chain) ? refundTo.trim() : '';
  const cached = !forceNew ? getCachedBridgeDeposit(userAddress, chain, tokenSymbol, validRefund) : null;
  if (cached) return cached;

  const deposit = await createBridgeDeposit({
    originAsset,
    destinationAsset,
    amountFloat: defaultAmount,
    originDecimals,
    destinationSymbol,
    userAddress,
    chainId: chain,
    refundTo: validRefund,
  });

  const record = {
    ...deposit,
    createdAt: Date.now(),
    chain,
    tokenSymbol,
    userAddress,
    refundTo: deposit.refundTo || validRefund || getDefaultRefundAddress(chain),
  };

  const cleanRefund = validRefund ? `_${validRefund}` : '';
  const cacheKey = `fw_bridge_addr_${userAddress}_${chain}_${tokenSymbol}${cleanRefund}`;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(record));
    } catch (_) {}
  }

  return record;
}

/**
 * Mark a bridge deposit as completed in cache.
 */
export function markBridgeDepositCompleted(userAddress, chain, tokenSymbol, refundTo = '') {
  if (typeof localStorage === 'undefined') return;
  const validRefund = refundTo && isValidRefundAddress(refundTo, chain) ? `_${refundTo.trim()}` : '';
  const cacheKey = `fw_bridge_addr_${userAddress}_${chain}_${tokenSymbol}${validRefund}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      parsed.status = 'COMPLETED';
      localStorage.setItem(cacheKey, JSON.stringify(parsed));
    }
  } catch (_) {}
}

/**
 * Poll the status of a bridge deposit.
 */
export async function checkBridgeStatus(depositAddress) {
  if (!depositAddress) return null;
  const apiKey = getNearIntentsApiKey();
  const headers = {};
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(`${NEAR_INTENTS_BASE_URL}/status?depositAddress=${encodeURIComponent(depositAddress)}`, {
    headers,
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    return { status: 'PENDING_DEPOSIT' };
  }

  return data;
}

/**
 * Trigger the relayer to deduct protocol fee and forward net tokens to user wallet.
 */
export async function claimBridgeForward({ depositAddress, userAddress, destinationSymbol }) {
  const isCapacitorOrLocal = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'file:'
  );

  const endpoints = isCapacitorOrLocal
    ? ['https://fiatwallet.app/api/relay_bridge', '/api/relay_bridge']
    : ['/api/relay_bridge', 'https://fiatwallet.app/api/relay_bridge'];

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          depositAddress,
          userAddress,
          destinationSymbol,
        }),
      });
      const data = await res.json();
      if (res.ok && data.signature) {
        return data;
      }
      if (data.alreadyForwarded) {
        return data;
      }
      lastError = new Error(data.error || 'Failed to claim forward');
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('Relayer bridge forward failed');
}

/**
 * Automatically sweeps and claims any pending bridge deposits that have
 * reached SUCCESS status on NEAR Intents, forwarding net tokens to user wallet.
 */
export async function sweepPendingBridgesForUser(userAddress) {
  if (!userAddress || typeof window === 'undefined') return [];

  const swept = [];
  const prefix = `fw_bridge_addr_${userAddress}_`;
  const pendingItems = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        try {
          const item = JSON.parse(localStorage.getItem(key));
          if (item && item.depositAddress && item.status !== 'COMPLETED') {
            pendingItems.push({ key, item });
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  for (const { key, item } of pendingItems) {
    try {
      const statusRes = await checkBridgeStatus(item.depositAddress);
      const status = String(statusRes?.status || '').toUpperCase();

      if (status === 'SUCCESS') {
        const forwardRes = await claimBridgeForward({
          depositAddress: item.depositAddress,
          userAddress,
          destinationSymbol: item.destinationSymbol || 'USDT',
        });
        if (forwardRes?.signature || forwardRes?.alreadyForwarded) {
          item.status = 'COMPLETED';
          item.signature = forwardRes.signature;
          try {
            localStorage.setItem(key, JSON.stringify(item));
          } catch (_) {}
          swept.push({ depositAddress: item.depositAddress, signature: forwardRes.signature });
          console.log(`[bridgeService] Swept & forwarded bridge deposit ${item.depositAddress} -> ${forwardRes.signature}`);
        }
      } else if (status === 'FAILED' || status === 'REFUNDED') {
        item.status = status;
        try {
          localStorage.setItem(key, JSON.stringify(item));
        } catch (_) {}
      }
    } catch (err) {
      // Ignore background sweep errors silently
    }
  }

  return swept;
}
