-- =============================================================================
-- FiatWallet Referral Program & Points System
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- =============================================================================

-- 1. Create referrals table to bind referee wallets to their referrer
CREATE TABLE IF NOT EXISTS public.referrals (
    id BIGSERIAL PRIMARY KEY,
    referrer_address TEXT NOT NULL,
    referred_address TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT referrer_not_self CHECK (LOWER(referrer_address) <> LOWER(referred_address))
);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_referrals_referrer 
ON public.referrals(referrer_address);

CREATE INDEX IF NOT EXISTS idx_referrals_referred 
ON public.referrals(referred_address);

-- Enable RLS and public policies
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'referrals' AND policyname = 'Allow public read on referrals'
    ) THEN
        CREATE POLICY "Allow public read on referrals" 
        ON public.referrals FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'referrals' AND policyname = 'Allow public insert on referrals'
    ) THEN
        CREATE POLICY "Allow public insert on referrals" 
        ON public.referrals FOR INSERT WITH CHECK (true);
    END IF;
END $$;

GRANT SELECT, INSERT ON public.referrals TO anon, authenticated, service_role;

-- 2. Add referrer_address column to p2p_transactions if not present
ALTER TABLE public.p2p_transactions 
ADD COLUMN IF NOT EXISTS referrer_address TEXT;

CREATE INDEX IF NOT EXISTS idx_p2p_referrer_address 
ON public.p2p_transactions(referrer_address)
WHERE referrer_address IS NOT NULL;

-- 3. Referral points calculation view
-- Rule: Every 10 USD volume (on-ramp + off-ramp) completed by referee = 1 Point to referrer
CREATE OR REPLACE VIEW public.referral_stats_view AS
SELECT 
    r.referrer_address,
    COUNT(DISTINCT r.referred_address) AS total_referred_users,
    COALESCE(FLOOR(SUM(t.usd_value) / 10), 0)::bigint AS referral_points,
    COUNT(t.id) AS total_referee_orders
FROM public.referrals r
LEFT JOIN public.p2p_transactions t 
  ON (LOWER(t.user_address) = LOWER(r.referred_address)
      AND (t.status = 'COMPLETED' OR t.status = 'SUCCESSFUL' OR t.status = 'CONFIRMED'))
GROUP BY r.referrer_address;

GRANT SELECT ON public.referral_stats_view TO anon, authenticated, service_role;

-- 4. Unified Leaderboard View (Personal Trading Points + Referral Points)
-- Personal: 1 USD volume = 1 Point
-- Referral: 10 USD referee volume = 1 Point
CREATE OR REPLACE VIEW public.leaderboard_view AS
WITH personal_pts AS (
    SELECT 
        LOWER(user_address) AS wallet_key,
        user_address,
        FLOOR(SUM(COALESCE(usd_value, 0)))::bigint AS personal_points,
        COUNT(id) AS total_transactions,
        MAX(created_at) AS last_active_at
    FROM public.p2p_transactions
    WHERE (status = 'COMPLETED' OR status = 'SUCCESSFUL' OR status = 'CONFIRMED')
      AND user_address IS NOT NULL 
      AND user_address != ''
    GROUP BY LOWER(user_address), user_address
),
ref_pts AS (
    SELECT 
        LOWER(r.referrer_address) AS wallet_key,
        MAX(r.referrer_address) AS referrer_address,
        COUNT(DISTINCT r.referred_address) AS total_referred_users,
        COALESCE(FLOOR(SUM(t.usd_value) / 10), 0)::bigint AS referral_points
    FROM public.referrals r
    LEFT JOIN public.p2p_transactions t 
      ON (LOWER(t.user_address) = LOWER(r.referred_address)
          AND (t.status = 'COMPLETED' OR t.status = 'SUCCESSFUL' OR t.status = 'CONFIRMED'))
    GROUP BY LOWER(r.referrer_address)
),
combined AS (
    SELECT 
        COALESCE(p.user_address, rf.referrer_address) AS user_address,
        COALESCE(p.personal_points, 0) AS personal_points,
        COALESCE(rf.referral_points, 0) AS referral_points,
        (COALESCE(p.personal_points, 0) + COALESCE(rf.referral_points, 0))::bigint AS total_points,
        COALESCE(p.total_transactions, 0) AS total_transactions,
        COALESCE(rf.total_referred_users, 0) AS total_referred_users,
        p.last_active_at
    FROM personal_pts p
    FULL OUTER JOIN ref_pts rf ON p.wallet_key = rf.wallet_key
)
SELECT 
    user_address,
    personal_points,
    referral_points,
    total_points,
    total_transactions,
    total_referred_users,
    last_active_at,
    DENSE_RANK() OVER (ORDER BY total_points DESC) AS rank
FROM combined
WHERE user_address IS NOT NULL AND total_points > 0;

GRANT SELECT ON public.leaderboard_view TO anon, authenticated, service_role;
