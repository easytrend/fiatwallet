-- =============================================================================
-- FiatWallet Leaderboard & Volume Points System
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- =============================================================================

-- 1. Index for lightning-fast point aggregation on completed P2P orders
CREATE INDEX IF NOT EXISTS idx_p2p_transactions_leaderboard 
ON public.p2p_transactions (user_address, status, usd_value)
WHERE status = 'COMPLETED' OR status = 'SUCCESSFUL' OR status = 'CONFIRMED';

-- 2. Real-time Leaderboard View
-- Automatically computes 1 Point = $1.00 USD on-ramp or off-ramp volume
CREATE OR REPLACE VIEW public.leaderboard_view AS
SELECT 
    user_address,
    ROUND(SUM(COALESCE(usd_value, 0))::numeric, 2) AS total_points,
    ROUND(SUM(COALESCE(usd_value, 0))::numeric, 2) AS total_volume_usd,
    ROUND(SUM(CASE WHEN transaction_type ILIKE '%onramp%' THEN COALESCE(usd_value, 0) ELSE 0 END)::numeric, 2) AS onramp_usd,
    ROUND(SUM(CASE WHEN transaction_type ILIKE '%offramp%' THEN COALESCE(usd_value, 0) ELSE 0 END)::numeric, 2) AS offramp_usd,
    COUNT(id) AS total_transactions,
    MAX(created_at) AS last_active_at,
    DENSE_RANK() OVER (ORDER BY SUM(COALESCE(usd_value, 0)) DESC) AS rank
FROM public.p2p_transactions
WHERE (status = 'COMPLETED' OR status = 'SUCCESSFUL' OR status = 'CONFIRMED')
  AND user_address IS NOT NULL 
  AND user_address != ''
GROUP BY user_address;

-- 3. Security & Access Policy
-- Allow anon/public read access to the leaderboard view
GRANT SELECT ON public.leaderboard_view TO anon, authenticated, service_role;
