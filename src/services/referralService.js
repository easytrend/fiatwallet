/**
 * src/services/referralService.js
 *
 * Client service to bind referrals and fetch referral statistics.
 */

import { getRelayEndpoint } from '../components/P2PPanel.jsx';

/**
 * Returns the shareable referral link for a given wallet address or linked Fiat Tag.
 * If user has a Fiat Tag (e.g. "$alex"), the link becomes "https://fiatwallet.app/?ref=alex".
 * Otherwise it falls back to "https://fiatwallet.app/?ref=<walletAddress>".
 */
export function getReferralLink(walletAddress, fiatTag = null) {
  if (!walletAddress && !fiatTag) return 'https://fiatwallet.app';
  try {
    const origin = (typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost') && !window.location.origin.includes('file://'))
      ? window.location.origin
      : 'https://fiatwallet.app';

    if (fiatTag) {
      const cleanTag = String(fiatTag).replace(/^\$/, '').trim();
      if (cleanTag) return `${origin}/?ref=${cleanTag}`;
    }
    return `${origin}/?ref=${walletAddress}`;
  } catch (e) {
    if (fiatTag) {
      const cleanTag = String(fiatTag).replace(/^\$/, '').trim();
      if (cleanTag) return `https://fiatwallet.app/?ref=${cleanTag}`;
    }
    return `https://fiatwallet.app/?ref=${walletAddress}`;
  }
}

/**
 * Binds a referee wallet to their referrer via the backend endpoint.
 * Accepts either a wallet address or a Fiat Tag.
 * Ensures idempotency using localStorage to avoid duplicate network calls.
 */
export async function bindReferral(refereeAddress, referrerAddress) {
  if (!refereeAddress || !referrerAddress) return null;
  const cleanReferee = String(refereeAddress).trim();
  const cleanReferrer = String(referrerAddress).trim();

  if (cleanReferee.toLowerCase() === cleanReferrer.toLowerCase()) {
    return null;
  }

  // Check if this wallet already reported binding in this browser
  const cacheKey = `fw_ref_bound_${cleanReferee.toLowerCase()}`;
  try {
    if (localStorage.getItem(cacheKey)) {
      return { success: true, cached: true };
    }
  } catch (e) {}

  const endpoint = getRelayEndpoint('/api/referral');

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        referrer_address: cleanReferrer,
        referred_address: cleanReferee,
      }),
    });

    const data = await res.json().catch(() => null);

    if (res.ok && data?.success) {
      try {
        localStorage.setItem(cacheKey, 'true');
      } catch (e) {}
      return data;
    }

    return data;
  } catch (err) {
    console.warn('[ReferralService] bindReferral error:', err.message);
    return null;
  }
}

/**
 * Fetches referral statistics (link, Fiat Tag status, total friends, points earned) for a wallet address.
 */
export async function fetchReferralStats(walletAddress) {
  if (!walletAddress) {
    return {
      success: false,
      fiat_tag: null,
      has_fiat_tag: false,
      total_referred_users: 0,
      referral_points: 0,
      referred_friends: [],
      referral_link: getReferralLink(''),
    };
  }

  const cleanAddr = String(walletAddress).trim();
  const cachedTag = (typeof localStorage !== 'undefined')
    ? (localStorage.getItem(`paj_user_tag_${cleanAddr}`) || localStorage.getItem('fw_fiat_tag'))
    : null;

  const endpoint = getRelayEndpoint(`/api/referral?address=${encodeURIComponent(cleanAddr)}`);

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Referral API HTTP ${res.status}`);
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('[ReferralService] fetchReferralStats error:', err.message);
    return {
      success: false,
      error: err.message,
      address: cleanAddr,
      fiat_tag: cachedTag,
      has_fiat_tag: Boolean(cachedTag),
      referral_link: getReferralLink(cleanAddr, cachedTag),
      total_referred_users: 0,
      referral_points: 0,
      referred_friends: [],
    };
  }
}
