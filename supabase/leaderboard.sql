-- =============================================================================
-- FiatWallet Leaderboard & Points System
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- =============================================================================

-- 1. Index for lightning-fast point aggregation on completed P2P orders
CREATE INDEX IF NOT EXISTS idx_p2p_transactions_leaderboard 
ON public.p2p_transactions (user_address, status, usd_value)
WHERE status = 'COMPLETED' OR status = 'SUCCESSFUL' OR status = 'CONFIRMED';

-- 2. Real-time Leaderboard View
-- 1 Point per 1 USD volume, stored as whole integer points (no decimals)
CREATE OR REPLACE VIEW public.leaderboard_view AS
SELECT 
    user_address,
    FLOOR(SUM(COALESCE(usd_value, 0)))::bigint AS total_points,
    COUNT(id) AS total_transactions,
    MAX(created_at) AS last_active_at,
    DENSE_RANK() OVER (ORDER BY FLOOR(SUM(COALESCE(usd_value, 0))) DESC) AS rank
FROM public.p2p_transactions
WHERE (status = 'COMPLETED' OR status = 'SUCCESSFUL' OR status = 'CONFIRMED')
  AND user_address IS NOT NULL 
  AND user_address != ''
GROUP BY user_address;

-- 3. Security & Access Policy
-- Allow anon/public read access to the leaderboard view
GRANT SELECT ON public.leaderboard_view TO anon, authenticated, service_role;
