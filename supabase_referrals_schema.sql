-- =============================================================================
-- Supabase Schema Migration: FiatWallet Referral Program & Leaderboard
-- =============================================================================
-- Run this script in your Supabase SQL Editor:
-- Dashboard -> SQL Editor -> New Query -> Paste & Run
-- =============================================================================

-- 1. Create the referrals table to store referee -> referrer relationships
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_address TEXT NOT NULL,
    referred_address TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Performance indexes for fast querying by referrer or referee
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals (referrer_address);
CREATE INDEX IF NOT EXISTS idx_referrals_referee ON public.referrals (referred_address);

-- 3. Row Level Security (RLS) policies
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Allow public read of referrals (needed for leaderboard and referral calculations)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'referrals' AND policyname = 'Allow public read referrals'
    ) THEN
        CREATE POLICY "Allow public read referrals"
            ON public.referrals FOR SELECT
            USING (true);
    END IF;
END $$;

-- Allow public insert of referrals (when users connect via a referral link)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'referrals' AND policyname = 'Allow public insert referrals'
    ) THEN
        CREATE POLICY "Allow public insert referrals"
            ON public.referrals FOR INSERT
            WITH CHECK (true);
    END IF;
END $$;
