/**
 * src/services/referralService.js
 *
 * Client service to bind referrals and fetch referral statistics.
 */

import { getRelayEndpoint } from '../components/P2PPanel.jsx';

/**
 * Returns the shareable referral link for a given wallet address.
 */
export function getReferralLink(walletAddress) {
  if (!walletAddress) return 'https://fiatwallet.app';
  try {
    const origin = (typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost') && !window.location.origin.includes('file://'))
      ? window.location.origin
      : 'https://fiatwallet.app';
    return `${origin}/?ref=${walletAddress}`;
  } catch (e) {
    return `https://fiatwallet.app/?ref=${walletAddress}`;
  }
}

/**
 * Binds a referee wallet to their referrer via the backend endpoint.
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
 * Fetches referral statistics (link, total friends, points earned) for a wallet address.
 */
export async function fetchReferralStats(walletAddress) {
  if (!walletAddress) {
    return {
      success: false,
      total_referred_users: 0,
      referral_points: 0,
      referred_friends: [],
      referral_link: getReferralLink(''),
    };
  }

  const cleanAddr = String(walletAddress).trim();
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
      referral_link: getReferralLink(cleanAddr),
      total_referred_users: 0,
      referral_points: 0,
      referred_friends: [],
    };
  }
}
