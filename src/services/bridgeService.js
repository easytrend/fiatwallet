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
  { id: 'bsc', name: 'BNB Chain', badge: 'BSC', logo: LOGOS.bsc },
  { id: 'arb', name: 'Arbitrum', badge: 'ARB', logo: LOGOS.arb },
  { id: 'eth', name: 'Ethereum', badge: 'ETH', logo: LOGOS.eth },
  { id: 'tron', name: 'Tron', badge: 'TRX', logo: LOGOS.tron },
  { id: 'pol', name: 'Polygon', badge: 'POL', logo: LOGOS.pol },
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
      min: '0.0001',
      logo: LOGOS.btc,
    },
  ],
  base: [
    {
      symbol: 'USDC',
      name: 'USD Coin (Base)',
      decimals: 6,
      assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
      min: '1',
      logo: LOGOS.usdc,
    },
    {
      symbol: 'ETH',
      name: 'Ethereum (Base)',
      decimals: 18,
      assetId: 'nep141:base.omft.near',
      min: '0.001',
      logo: LOGOS.eth,
    },
  ],
  bsc: [
    {
      symbol: 'USDT',
      name: 'Tether USD (BSC)',
      decimals: 18,
      assetId: 'nep245:v2_1.omni.hot.tg:56_2CMMyVTGZkeyNZTSvS5sarzfir6g',
      min: '1',
      logo: LOGOS.usdt,
    },
    {
      symbol: 'USDC',
      name: 'USD Coin (BSC)',
      decimals: 18,
      assetId: 'nep245:v2_1.omni.hot.tg:56_2w93GqMcEmQFDru84j3HZZWt557r',
      min: '1',
      logo: LOGOS.usdc,
    },
    {
      symbol: 'BNB',
      name: 'BNB',
      decimals: 18,
      assetId: 'nep245:v2_1.omni.hot.tg:56_11111111111111111111',
      min: '0.005',
      logo: LOGOS.bsc,
    },
  ],
  arb: [
    {
      symbol: 'USDC',
      name: 'USD Coin (Arbitrum)',
      decimals: 6,
      assetId: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
      min: '1',
      logo: LOGOS.usdc,
    },
    {
      symbol: 'ETH',
      name: 'Ethereum (Arbitrum)',
      decimals: 18,
      assetId: 'nep141:arb.omft.near',
      min: '0.001',
      logo: LOGOS.eth,
    },
  ],
  eth: [
    {
      symbol: 'USDT',
      name: 'Tether USD (ERC20)',
      decimals: 6,
      assetId: 'nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near',
      min: '5',
      logo: LOGOS.usdt,
    },
    {
      symbol: 'USDC',
      name: 'USD Coin (ERC20)',
      decimals: 6,
      assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
      min: '5',
      logo: LOGOS.usdc,
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      assetId: 'nep141:eth.omft.near',
      min: '0.003',
      logo: LOGOS.eth,
    },
  ],
  tron: [
    {
      symbol: 'USDT',
      name: 'Tether USD (TRC20)',
      decimals: 6,
      assetId: 'nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near',
      min: '5',
      logo: LOGOS.usdt,
    },
    {
      symbol: 'TRX',
      name: 'Tron',
      decimals: 6,
      assetId: 'nep141:tron.omft.near',
      min: '10',
      logo: LOGOS.tron,
    },
  ],
  pol: [
    {
      symbol: 'USDC',
      name: 'USD Coin (Polygon)',
      decimals: 6,
      assetId: 'nep245:v2_1.omni.hot.tg:137_qiStmoQJDQPTebaPjgx5VBxZv6L',
      min: '1',
      logo: LOGOS.usdc,
    },
    {
      symbol: 'USDT',
      name: 'Tether USD (Polygon)',
      decimals: 6,
      assetId: 'nep245:v2_1.omni.hot.tg:137_3hpYoaLtt8MP1Z2GH1U473DMRKgr',
      min: '1',
      logo: LOGOS.usdt,
    },
    {
      symbol: 'POL',
      name: 'Polygon (POL)',
      decimals: 18,
      assetId: 'nep245:v2_1.omni.hot.tg:137_11111111111111111111',
      min: '1',
      logo: LOGOS.pol,
    },
  ],
};

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
 * Fetch a dry-run quote from NEAR Intents 1Click API.
 */
export async function getBridgeQuote({
  originAsset,
  destinationAsset,
  amountFloat,
  originDecimals = 6,
  destinationDecimals = 6,
  destinationSymbol = 'USDT',
  refundTo = '0x0000000000000000000000000000000000000001',
}) {
  const amountUnits = formatUnits(amountFloat, originDecimals);
  if (amountUnits === '0') throw new Error('Amount too small');

  const relayerPubkey = getEffectiveRelayerPublicKey();
  const apiKey = getNearIntentsApiKey();

  const body = {
    dry: true,
    swapType: 'EXACT_INPUT',
    slippageTolerance: 100, // 1%
    originAsset,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset,
    amount: amountUnits,
    refundTo: refundTo || '0x0000000000000000000000000000000000000001',
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
    throw new Error(data.message || data.error || 'Failed to get bridge quote');
  }

  const rawOut = parseFloat(data.quote?.amountOutFormatted || '0');
  const amountInUsd = parseFloat(data.quote?.amountInUsd || '0');
  const amountOutUsd = parseFloat(data.quote?.amountOutUsd || '0');

  const isUsdToken = destinationSymbol.includes('USD');
  let protocolFee = 0;
  if (isUsdToken) {
    const rawFee = rawOut * 0.004;
    protocolFee = Math.max(0.10, Math.round(rawFee * 100) / 100);
  } else {
    protocolFee = rawOut * 0.004;
  }

  const netReceived = Math.max(0, rawOut - protocolFee);

  return {
    quoteRaw: data.quote,
    amountIn: parseFloat(data.quote?.amountInFormatted || amountFloat),
    grossOut: rawOut,
    protocolFee,
    netReceived: Math.round(netReceived * 1000000) / 1000000,
    timeEstimate: data.quote?.timeEstimate || 25,
    amountInUsd,
    amountOutUsd,
  };
}

/**
 * Generate a real live deposit address for the bridge.
 */
export async function createBridgeDeposit({
  originAsset,
  destinationAsset,
  amountFloat = '5',
  originDecimals = 6,
  destinationSymbol = 'USDT',
  userAddress,
  refundTo,
}) {
  const amountUnits = formatUnits(amountFloat, originDecimals);
  const relayerPubkey = getEffectiveRelayerPublicKey();
  const apiKey = getNearIntentsApiKey();

  const body = {
    dry: false,
    swapType: 'EXACT_INPUT',
    slippageTolerance: 100, // 1%
    originAsset,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset,
    amount: amountUnits,
    refundTo: refundTo || '0x0000000000000000000000000000000000000001',
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

  const rawOut = parseFloat(data.quote?.amountOutFormatted || '0');
  const isUsdToken = destinationSymbol.includes('USD');
  const protocolFee = isUsdToken
    ? Math.max(0.10, Math.round(rawOut * 0.004 * 100) / 100)
    : rawOut * 0.004;
  const netReceived = Math.max(0, rawOut - protocolFee);

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
      usdValue: data.quote?.amountOutUsd || netReceived,
      status: 'PENDING',
      depositAddress,
      type: 'bridge',
    });
  } catch (err) {
    console.warn('[bridgeService] Failed to log pending bridge to Supabase:', err.message);
  }

  return {
    depositAddress,
    timeEstimate: data.quote?.timeEstimate || 25,
    grossOut: rawOut,
    protocolFee,
    netReceived,
    deadline: data.quote?.deadline,
    correlationId: data.correlationId,
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
  forceNew = false,
}) {
  const cacheKey = `fw_bridge_addr_${userAddress}_${chain}_${tokenSymbol}`;
  if (!forceNew && typeof localStorage !== 'undefined') {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const ageHours = (Date.now() - (parsed.createdAt || 0)) / (1000 * 60 * 60);
        // Valid for up to 48 hours unless completed
        if (ageHours < 48 && parsed.depositAddress && parsed.status !== 'COMPLETED') {
          return parsed;
        }
      }
    } catch (_) {}
  }

  // Create new deposit address instantly
  const deposit = await createBridgeDeposit({
    originAsset,
    destinationAsset,
    amountFloat: '5',
    originDecimals,
    destinationSymbol,
    userAddress,
  });

  const record = {
    ...deposit,
    createdAt: Date.now(),
    chain,
    tokenSymbol,
    userAddress,
  };

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
export function markBridgeDepositCompleted(userAddress, chain, tokenSymbol) {
  if (typeof localStorage === 'undefined') return;
  const cacheKey = `fw_bridge_addr_${userAddress}_${chain}_${tokenSymbol}`;
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
