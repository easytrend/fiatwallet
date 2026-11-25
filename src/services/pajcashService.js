/**
 * pajcashService.js
 *
 * Wallet + Email OTP integration with the PajCash (paj_ramp) API SDK.
 * Follows the official SDK signatures:
 *   https://github.com/paj-cash/paj_ramp
 */

import {
  initializeSDK,
  initiate as sdkInitiate,
  verify as sdkVerify,
  getBanks as sdkGetBanks,
  resolveBankAccount as sdkResolveBankAccount,
  createOfframpOrder as sdkCreateOfframpOrder,
  createOnrampOrder as sdkCreateOnrampOrder,
  getOnrampValue as sdkGetOnrampValue,
  observeOrder,
  getAllRate as sdkGetAllRate,
  getAllTransactions as sdkGetAllTransactions,
  getTransaction as sdkGetTransaction,
  Environment,
  submitKyc as sdkSubmitKyc
} from 'paj_ramp';

export { observeOrder };

/**
 * Returns a persistent, unique device UUID for this browser/device.
 * Generated once and stored in localStorage so the same browser always
 * sends the same ID to PajCash, but different devices get different IDs.
 * This prevents PajCash from hitting its per-device session limit when
 * multiple devices share the same wallet.
 */
function getDeviceUUID() {
  const STORAGE_KEY = 'fiatwallet_device_uuid';
  let uuid = localStorage.getItem(STORAGE_KEY);
  if (!uuid) {
    // crypto.randomUUID() is available in all modern browsers
    uuid = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'fw-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(STORAGE_KEY, uuid);
  }
  return uuid;
}

// Base URL resolved from env var; defaults to production
let BASE_URL = 'https://api.paj.cash';

let remoteApiKey = null;
let fetchConfigPromise = null;

/**
 * Initialize the SDK environment and set the base URL.
 * @param {string} envString - 'production' | 'staging' | 'local'
 */
export function initPajSDK(envString = 'production') {
  const clean = (envString || '').toLowerCase();
  if (clean.includes('staging') || clean.includes('dev')) {
    BASE_URL = 'https://api-staging.paj.cash';
    initializeSDK(Environment.Staging);
  } else if (clean.includes('local')) {
    BASE_URL = 'http://localhost:3000';
    initializeSDK(Environment.Local);
  } else {
    BASE_URL = 'https://api.paj.cash';
    initializeSDK(Environment.Production);
  }
}

// Immediately ensure SDK defaults to production so requests hit https://api.paj.cash
initPajSDK(import.meta.env.VITE_PAJCASH_ENV || 'production');

let remoteRelayerPublicKey = null;
let remoteUseOnrampRelayer = false;

/**
 * Fetch PajCash merchant API key and Relayer public key from the Vercel serverless config endpoint.
 * Checks relative endpoint first, then falls back to production domain https://fiatwallet.app/api/paj_config.
 */
export async function fetchRemotePajConfig() {
  if (remoteApiKey && remoteRelayerPublicKey) return remoteApiKey;
  if (fetchConfigPromise) return fetchConfigPromise;

  fetchConfigPromise = (async () => {
    const isCapacitorOrLocal = typeof window !== 'undefined' && (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'ionic:' ||
      window.location.protocol === 'file:' ||
      Boolean(window.Capacitor?.isNativePlatform?.()) ||
      Boolean(window.AndroidBridge) ||
      Boolean(window.FiatWalletBridge)
    );
    const endpoints = isCapacitorOrLocal
      ? ['https://fiatwallet.app/api/paj_config', '/api/paj_config']
      : ['/api/paj_config', 'https://fiatwallet.app/api/paj_config'];
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data?.apiKey) {
            remoteApiKey = data.apiKey;
            try { localStorage.setItem('paj_merchant_api_key', data.apiKey); } catch (e) {}
            if (data?.env) {
              initPajSDK(data.env);
            }
          }
          if (data?.rpcUrl) {
            try { localStorage.setItem('fiatwallet_rpc_url', data.rpcUrl); } catch (e) {}
          }
          if (data?.supabaseUrl && data?.supabaseAnonKey) {
            try {
              localStorage.setItem('fiatwallet_supabase_url', data.supabaseUrl);
              localStorage.setItem('fiatwallet_supabase_anon_key', data.supabaseAnonKey);
            } catch (e) {}
          }
          if (data?.relayerPublicKey) {
            remoteRelayerPublicKey = data.relayerPublicKey;
            remoteUseOnrampRelayer = Boolean(data.useOnrampRelayer);
            try {
              localStorage.setItem('relayer_public_key', data.relayerPublicKey);
              localStorage.setItem('use_onramp_relayer', 'true');
              if (data?.nearIntentsApiKey) {
                localStorage.setItem('near_intents_api_key', data.nearIntentsApiKey);
              }
            } catch (e) {}
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('fiatwallet:config_updated', {
              detail: {
                apiKey: remoteApiKey,
                rpcUrl: data?.rpcUrl,
                supabaseUrl: data?.supabaseUrl,
                supabaseAnonKey: data?.supabaseAnonKey
              }
            }));
          }
          if (remoteApiKey) return remoteApiKey;
        }
      } catch (err) {
        // Proceed to next endpoint
      }
    }
    const cached = typeof localStorage !== 'undefined' ? localStorage.getItem('paj_merchant_api_key') : null;
    return cached || remoteApiKey || null;
  })();

  try {
    const result = await fetchConfigPromise;
    return result;
  } finally {
    fetchConfigPromise = null;
  }
}

const DEFAULT_RELAYER_PUBLIC_KEY = '5xh9BFXqCgpUxGbf3QzADNze945aNSiVG9EFNa8vvb3u';

export function getEffectiveRelayerPublicKey() {
  return (
    import.meta.env.VITE_RELAYER_PUBLIC_KEY ||
    remoteRelayerPublicKey ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('relayer_public_key') : null) ||
    DEFAULT_RELAYER_PUBLIC_KEY
  );
}

export function getEffectiveUseOnrampRelayer() {
  if (import.meta.env.VITE_ONRAMP_USE_RELAYER === 'true') return true;
  if (import.meta.env.VITE_ONRAMP_USE_RELAYER === 'false') return false;
  if (remoteUseOnrampRelayer) return true;
  if (typeof localStorage !== 'undefined') {
    const cached = localStorage.getItem('use_onramp_relayer');
    if (cached === 'true') return true;
    if (cached === 'false') return false;
  }
  return Boolean(getEffectiveRelayerPublicKey());
}

export async function getEffectiveRelayerConfigAsync() {
  try {
    await fetchRemotePajConfig();
  } catch (err) {
    // Rely on environment and default constants
  }
  return {
    relayerPublicKey: getEffectiveRelayerPublicKey(),
    useOnrampRelayer: getEffectiveUseOnrampRelayer(),
  };
}

if (typeof window !== 'undefined') {
  fetchRemotePajConfig().catch(() => {});
}

/**
 * Resolves the effective API key or merchant auth token synchronously.
 */
export function getEffectiveApiKey() {
  return (
    import.meta.env.VITE_PAJCASH_API_KEY ||
    remoteApiKey ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('paj_merchant_api_key') : null) ||
    ''
  );
}

/**
 * Resolves the effective API key asynchronously, fetching from Vercel config endpoint if needed.
 */
export async function getEffectiveApiKeyAsync() {
  let key = getEffectiveApiKey();
  if (key) return key;
  key = await fetchRemotePajConfig();
  return key || getEffectiveApiKey();
}

/**
 * Initiate an OTP session for the user.
 * @param {string} emailOrPhone - User email or phone number
 * @param {string} [apiKey] - Merchant API Key
 */
export async function initiateSession(emailOrPhone, apiKey) {
  initPajSDK(import.meta.env.VITE_PAJCASH_ENV || 'production');
  const effectiveKey = apiKey || await getEffectiveApiKeyAsync();
  if (!effectiveKey) {
    throw new Error('PajCash service configuration missing. Please verify API configuration.');
  }
  try {
    return await sdkInitiate(emailOrPhone, effectiveKey);
  } catch (error) {
    const msg = error.response?.data?.message || error.message || String(error);
    throw new Error(msg);
  }
}

/**
 * Verify OTP session and obtain JWT token.
 * @param {string} emailOrPhone - User email or phone number
 * @param {string} otp - 4-digit OTP code
 * @param {string} [apiKey] - Merchant API Key
 */
export async function verifySession(emailOrPhone, otp, apiKey) {
  initPajSDK(import.meta.env.VITE_PAJCASH_ENV || 'production');
  const effectiveKey = apiKey || await getEffectiveApiKeyAsync();
  if (!effectiveKey) {
    throw new Error('PajCash service configuration missing. Please verify API configuration.');
  }
  try {
    const device = {
      uuid: getDeviceUUID(),
      device: navigator.userAgent?.includes('Mobile') ? 'Mobile' : 'Desktop',
      os: navigator.platform || 'Web',
      browser: navigator.userAgent?.split(' ').pop() || 'WebBrowser'
    };
    return await sdkVerify(emailOrPhone, otp, device, effectiveKey);
  } catch (error) {
    const msg = error.response?.data?.message || error.message || String(error);
    throw new Error(msg);
  }
}

/**
 * Fetch supported token list (public endpoint — no auth required).
 */
export async function getSupportedTokens() {
  const res = await fetch(`${BASE_URL}/token`);
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || `Failed to fetch tokens: ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch available banks.
 * @param {string} sessionToken - User JWT Session Token
 */
export async function getBanks(sessionToken) {
  const token = sessionToken || getEffectiveApiKey();
  try {
    return await sdkGetBanks(token);
  } catch (error) {
    const msg = error.response?.data?.message || error.message || String(error);
    throw new Error(msg);
  }
}

/**
 * Register a bank account with PajCash Public API v2 to derive its deterministic on-chain addresses.
 * Idempotent: returns existing address if already registered.
 *
 * @param {string} bankCode - Bank 6-digit NIBSS code (e.g. '100033' for PalmPay, '000017' for Wema)
 * @param {string} accountNumber - 10-digit account number
 * @returns {Promise<{ id: string, accountName: string, accountNumber: string, bank: string, address: string, evmAddress: string }>}
 */
export async function registerBankAccountV2(bankCode, accountNumber) {
  const apiKey = (await getEffectiveApiKeyAsync()) || getEffectiveApiKey();
  if (!apiKey) {
    throw new Error('PajCash API key not configured.');
  }
  const cleanCode = String(bankCode || '').trim();
  const cleanNum = String(accountNumber || '').replace(/\D/g, '').trim();
  if (!cleanCode || !cleanNum) {
    throw new Error('Bank code and account number are required.');
  }

  const res = await fetch(`${BASE_URL}/pub/v2/bank-account`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      bankCode: cleanCode,
      accountNumber: cleanNum,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const msg = Array.isArray(errData.message)
      ? errData.message.join(', ')
      : (errData.message || `Bank account registration failed: ${res.status}`);
    throw new Error(msg);
  }

  return await res.json();
}

/**
 * Fetch live rates for any supported fiat currency from PajCash Public API v2.
 * @param {'NGN' | 'GHS' | 'KES' | 'TZS' | 'ZAR' | 'USD'} [currency='NGN']
 */
export async function getV2Rate(currency = 'NGN') {
  const apiKey = (await getEffectiveApiKeyAsync()) || getEffectiveApiKey();
  const cleanCurr = String(currency || 'NGN').toUpperCase().trim();
  const res = await fetch(`${BASE_URL}/pub/v2/rate?currency=${cleanCurr}`, {
    headers: apiKey ? { 'x-api-key': apiKey } : {},
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || `Failed to fetch live v2 rate: ${res.status}`);
  }
  return await res.json();
}

/**
 * Resolve a bank account number to its registered account name.
 * Uses PajCash v2 for deterministic address resolution when bankCode is available,
 * falling back to SDK v1 resolution.
 *
 * @param {string} sessionToken  - User JWT Session Token
 * @param {string} bankId        - Bank ID from getBanks()
 * @param {string} accountNumber - Account number to resolve
 * @param {string} [bankCode]    - Optional Bank NIBSS code (e.g. '100033')
 */
export async function resolveBankAccount(sessionToken, bankId, accountNumber, bankCode = null) {
  const cleanNum = String(accountNumber || '').replace(/\D/g, '').trim();
  const effectiveCode = String(bankCode || (bankId && !bankId.includes('-') && bankId.length <= 6 ? bankId : '') || '').trim();

  // Try v2 resolution first if bankCode is available
  if (effectiveCode) {
    try {
      const v2Res = await registerBankAccountV2(effectiveCode, cleanNum);
      if (v2Res?.accountName) {
        return v2Res;
      }
    } catch (v2Err) {
      console.warn('[PajCash] v2 bank resolution notice, falling back to v1:', v2Err?.message);
    }
  }

  const token = sessionToken || getEffectiveApiKey();
  try {
    return await sdkResolveBankAccount(token, bankId, cleanNum);
  } catch (error) {
    const msg = error.response?.data?.message || error.message || String(error);
    throw new Error(msg);
  }
}

const COUNTRY_MAP = {
  NGA: 'NG', NGN: 'NG', NG: 'NG',
  GHA: 'GH', GHS: 'GH', GH: 'GH',
  KEN: 'KE', KES: 'KE', KE: 'KE',
  TZA: 'TZ', TZS: 'TZ', TZ: 'TZ',
  ZAF: 'ZA', ZAR: 'ZA', ZA: 'ZA',
};

/**
 * Resolve ISO 2-letter PajCash country code from a country or currency code.
 * @param {string} [codeOrCurrency='NG']
 */
export function mapToPajCountry(codeOrCurrency = 'NG') {
  const key = String(codeOrCurrency || 'NG').toUpperCase().trim();
  return COUNTRY_MAP[key] || 'NG';
}

function getKycSyncStorageKey(idType, country, idNumber, walletAddress = '') {
  const scope = String(walletAddress || '').trim() || 'anon';
  return `paj_kyc_synced_${scope}_${country}_${idType}_${idNumber}`;
}

function isKycItemSyncedLocal(idType, country, idNumber, walletAddress = '') {
  if (!idNumber || typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(getKycSyncStorageKey(idType, country, idNumber, walletAddress)) === '1';
  } catch {
    return false;
  }
}

function setKycItemSyncedLocal(idType, country, idNumber, walletAddress = '') {
  if (!idNumber || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(getKycSyncStorageKey(idType, country, idNumber, walletAddress), '1');
  } catch { /* ignore storage restrictions */ }
}

/**
 * Synchronously inspect cached local PajCash KYC sync status for stored identity numbers.
 */
export function getKycSyncStatusLocal({ bvn, nin, country = 'NG', walletAddress = '' } = {}) {
  const cleanCountry = mapToPajCountry(country);
  const cleanBvn = bvn ? String(bvn).replace(/\D/g, '').trim() : '';
  const cleanNin = nin ? String(nin).replace(/\D/g, '').trim() : '';
  if (!cleanBvn && !cleanNin) {
    return { synced: false, bvnSynced: false, ninSynced: false };
  }
  const bvnSynced = !cleanBvn || isKycItemSyncedLocal('BVN', cleanCountry, cleanBvn, walletAddress);
  const ninSynced = !cleanNin || isKycItemSyncedLocal('NIN', cleanCountry, cleanNin, walletAddress);
  return {
    synced: bvnSynced && ninSynced,
    bvnSynced,
    ninSynced,
  };
}

/**
 * Submit and verify government-ID KYC (BVN / NIN) with PajCash.
 * Strictly requires an active user session token (obtained from email OTP verifySession).
 *
 * @param {string} sessionToken - User JWT Session Token
 * @param {string} idNumber     - 11-digit BVN or NIN
 * @param {'BVN' | 'NIN'} [idType='BVN']
 * @param {string} [country='NG']
 */
export async function submitUserKyc(sessionToken, idNumber, idType = 'BVN', country = 'NG') {
  initPajSDK(import.meta.env.VITE_PAJCASH_ENV || 'production');
  if (!sessionToken || typeof sessionToken !== 'string' || !sessionToken.trim()) {
    throw new Error('Active email-verified session required to submit KYC.');
  }
  const cleanCountry = mapToPajCountry(country);
  try {
    return await sdkSubmitKyc(sessionToken.trim(), String(idNumber).trim(), idType, cleanCountry);
  } catch (error) {
    const rawMsg = error.response?.data?.message ?? error.message ?? String(error);
    const msg = Array.isArray(rawMsg) ? rawMsg.join(', ') : String(rawMsg);
    const err = new Error(msg);
    err.status = error.response?.status;
    throw err;
  }
}

const KYC_SESSION_ERR_RE = /unauthorized|session|expired|jwt|invalid token|not logged/i;
const KYC_VALIDATION_ERR_RE = /already used|invalid|mismatch|not found|incorrect|failed verification|does not match/i;

/**
 * Sync stored BVN / NIN documents with PajCash /pub/kyc idempotently.
 * Tracks individual BVN and NIN sync completion locally, surfaces ID validation vs
 * expired-session errors, and prevents redundant /pub/kyc requests once verified.
 */
export async function syncUserKycWithPajCash(
  sessionToken,
  { bvn, nin, country = 'NG', walletAddress = '', force = false } = {}
) {
  const cleanCountry = mapToPajCountry(country);
  const cleanBvn = bvn ? String(bvn).replace(/\D/g, '').trim() : '';
  const cleanNin = nin ? String(nin).replace(/\D/g, '').trim() : '';

  if (!cleanBvn && !cleanNin) {
    return { synced: false, skipped: true, reason: 'no_documents', bvnSynced: false, ninSynced: false, error: null };
  }
  if (!sessionToken || !String(sessionToken).trim()) {
    return { synced: false, skipped: true, reason: 'no_session', bvnSynced: false, ninSynced: false, error: null };
  }
  if (cleanBvn && cleanNin && cleanBvn === cleanNin) {
    return {
      synced: false,
      skipped: false,
      validationError: true,
      bvnSynced: false,
      ninSynced: false,
      error: 'BVN and NIN cannot be the exact same number.',
    };
  }

  const submitSingle = async (idType, idValue) => {
    if (!idValue) return { ok: true, fromCache: true };
    if (!force && isKycItemSyncedLocal(idType, cleanCountry, idValue, walletAddress)) {
      return { ok: true, fromCache: true };
    }
    try {
      await submitUserKyc(sessionToken, idValue, idType, cleanCountry);
      setKycItemSyncedLocal(idType, cleanCountry, idValue, walletAddress);
      return { ok: true, fromCache: false };
    } catch (err) {
      const msg = err?.message || `Failed to verify ${idType}`;
      const status = err?.status;
      const lower = msg.toLowerCase();
      if (lower.includes('already verified') || lower.includes('already submitted')) {
        setKycItemSyncedLocal(idType, cleanCountry, idValue, walletAddress);
        return { ok: true, fromCache: false };
      }
      const sessionExpired = status === 401 || KYC_SESSION_ERR_RE.test(msg);
      const validationError = !sessionExpired && (status === 400 || status === 409 || KYC_VALIDATION_ERR_RE.test(msg));
      return { ok: false, error: `${idType}: ${msg}`, rawError: msg, sessionExpired, validationError };
    }
  };

  const bvnRes = await submitSingle('BVN', cleanBvn);
  const ninRes = bvnRes.sessionExpired
    ? { ok: false, error: null, sessionExpired: true, validationError: false }
    : await submitSingle('NIN', cleanNin);

  const synced = bvnRes.ok && ninRes.ok;
  const errors = [bvnRes.error, ninRes.error].filter(Boolean);

  return {
    synced,
    alreadySynced: Boolean(bvnRes.fromCache && ninRes.fromCache),
    skipped: false,
    bvnSynced: bvnRes.ok,
    ninSynced: ninRes.ok,
    sessionExpired: Boolean(bvnRes.sessionExpired || ninRes.sessionExpired),
    validationError: Boolean(bvnRes.validationError || ninRes.validationError),
    error: errors.length > 0 ? errors.join(' · ') : null,
  };
}

/**
 * Create an off-ramp order.
 * Returns: { id, address, mint, currency, amount, fiatAmount, rate, fee }
 *
 * @param {Object} order
 * @param {string} sessionToken - User JWT Session Token
 */
export async function createOfframpOrder(order, sessionToken) {
  const token = sessionToken || getEffectiveApiKey();
  try {
    const cleanOrder = { ...order };
    // PajCash API strictly rejects payloads with both amount and fiatAmount:
    // "Cannot provide both amount and fiatAmount. Please provide only one."
    if (cleanOrder.amount != null && cleanOrder.fiatAmount != null) {
      if (cleanOrder.inputMode === 'fiat') {
        delete cleanOrder.amount;
      } else if (cleanOrder.inputMode === 'crypto') {
        delete cleanOrder.fiatAmount;
      } else {
        // Default: keep amount (crypto) and remove fiatAmount
        delete cleanOrder.fiatAmount;
      }
    }
    delete cleanOrder.inputMode;
    return await sdkCreateOfframpOrder(cleanOrder, token);
  } catch (error) {
    const msg = error.response?.data?.message || error.message || String(error);
    throw new Error(msg);
  }
}

/**
 * Fetch live exchange rates (public — no auth required).
 * Uses the paj_ramp SDK internally.
 */
export async function getAllRate() {
  try {
    return await sdkGetAllRate();
  } catch (error) {
    const msg = error.response?.data?.message || error.message || String(error);
    throw new Error(msg);
  }
}

/**
 * Create an on-ramp order (Buy).
 * PajCash returns bank account details; user transfers fiat to receive crypto.
 * @param {Object} order  - { currency, amount, wallet, chain, fee? }
 * @param {string} sessionToken
 */
export async function createOnrampOrder(order, sessionToken) {
  const token = sessionToken || getEffectiveApiKey();
  try {
    const cleanOrder = { ...order };
    if (cleanOrder.amount != null && cleanOrder.fiatAmount != null) {
      if (cleanOrder.inputMode === 'crypto') {
        delete cleanOrder.fiatAmount;
      } else {
        delete cleanOrder.amount;
      }
    }
    delete cleanOrder.inputMode;
    return await sdkCreateOnrampOrder(cleanOrder, token);
  } catch (error) {
    const msg = error.response?.data?.message || error.message || String(error);
    throw new Error(msg);
  }
}

/**
 * Get the estimated crypto value for a given fiat amount (onramp direction).
 * @param {{ currency: string, amount: number }} query
 * @param {string} sessionToken
 */
export async function getOnrampValue(query, sessionToken) {
  const token = sessionToken || getEffectiveApiKey();
  try {
    return await sdkGetOnrampValue(query, token);
  } catch (error) {
    const msg = error.response?.data?.message || error.message || String(error);
    throw new Error(msg);
  }
}

export async function getTransactionHistory(sessionToken) {
  const token = sessionToken || getEffectiveApiKey();
  try {
    return await sdkGetAllTransactions(token);
  } catch (error) {
    const msg = error.response?.data?.message || error.message || String(error);
    throw new Error(msg);
  }
}

/**
 * Notify PajCash API that the onramp transaction has been cancelled.
 */
export async function cancelOnrampOrder(orderId, sessionToken) {
  try {
    // Try REST endpoint options
    const res = await fetch(`${BASE_URL}/pub/onramp/${orderId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`
      }
    });
    if (!res.ok) {
      await fetch(`${BASE_URL}/pub/onramp/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ orderId })
      });
    }
  } catch (error) {
    console.warn('cancelOnrampOrder API error:', error);
  }
}

/**
 * Notify PajCash API that the user has completed the fiat payment.
 */
export async function paidOnrampOrder(orderId, sessionToken) {
  try {
    // Try REST endpoint options
    const res = await fetch(`${BASE_URL}/pub/onramp/${orderId}/paid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`
      }
    });
    if (!res.ok) {
      await fetch(`${BASE_URL}/pub/onramp/paid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ orderId })
      });
    }
  } catch (error) {
    console.warn('paidOnrampOrder API error:', error);
  }
}

/**
 * Fetch a single transaction detail to poll its latest status.
 */
export async function getTransaction(sessionToken, orderId) {
  const token = sessionToken || getEffectiveApiKey();
  try {
    return await sdkGetTransaction(token, orderId);
  } catch (error) {
    const msg = error.response?.data?.message || error.message || String(error);
    throw new Error(msg);
  }
}
