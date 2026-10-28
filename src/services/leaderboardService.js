/**
 * src/services/leaderboardService.js
 *
 * Client service to fetch leaderboard data and user rank from /api/leaderboard.
 */

import { getRelayEndpoint } from '../components/P2PPanel.jsx';

export async function fetchLeaderboard({ address = null, limit = 50, offset = 0, timeframe = 'all' } = {}) {
  const params = new URLSearchParams();
  if (address) params.set('address', address);
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  if (timeframe) params.set('timeframe', timeframe);

  const endpoint = getRelayEndpoint(`/api/leaderboard?${params.toString()}`);

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Leaderboard API HTTP ${res.status}`);
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('[Leaderboard] API fetch error:', err.message);
    return {
      success: false,
      error: err.message,
      leaderboard: [],
      user: address ? {
        address,
        short_address: `${address.slice(0, 4)}...${address.slice(-4)}`,
        rank: null,
        total_points: 0,
        total_volume_usd: 0,
        tier: 'Unranked',
        tier_progress: 0,
        next_tier_target: 250,
      } : null,
      total_participants: 0,
      total_points_distributed: 0,
    };
  }
}
