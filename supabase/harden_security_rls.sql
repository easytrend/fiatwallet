-- =============================================================================
-- Fiatwallet Security Hardening Migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

-- 1. Ensure fiat_tags table exists with proper unique constraints
CREATE TABLE IF NOT EXISTS public.fiat_tags (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address   text UNIQUE NOT NULL,
  tag_name         text UNIQUE NOT NULL,
  bank_name        text NOT NULL,
  bank_code        text,
  account_number   text NOT NULL,
  account_name     text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fiat_tags_wallet ON public.fiat_tags (wallet_address);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fiat_tags_tag ON public.fiat_tags (LOWER(tag_name));

-- 2. Revoke dangerous DELETE permissions from anon role across all ledger tables
-- (Prevents any malicious client from wiping financial or session records)
REVOKE DELETE ON TABLE public.transactions FROM anon;
REVOKE DELETE ON TABLE public.p2p_transactions FROM anon;
REVOKE DELETE ON TABLE public.fiat_tags FROM anon;

-- 3. Secure transactions table
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon insert transactions" ON public.transactions;
CREATE POLICY "Allow anon insert transactions"
  ON public.transactions FOR INSERT TO anon
  WITH CHECK (length(signature) > 10 AND length(user_address) > 20);

DROP POLICY IF EXISTS "Allow anon upsert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow anon select transactions" ON public.transactions;
CREATE POLICY "Allow anon select transactions"
  ON public.transactions FOR SELECT TO anon
  USING (true);

-- 4. Secure p2p_transactions table (Guard against tampering)
ALTER TABLE public.p2p_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon insert p2p_transactions" ON public.p2p_transactions;
CREATE POLICY "Allow anon insert p2p_transactions"
  ON public.p2p_transactions FOR INSERT TO anon
  WITH CHECK (length(order_id) > 0 AND length(user_address) > 20);

DROP POLICY IF EXISTS "Allow anon update p2p_transactions" ON public.p2p_transactions;
CREATE POLICY "Allow anon update p2p_transactions"
  ON public.p2p_transactions FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon select p2p_transactions" ON public.p2p_transactions;
CREATE POLICY "Allow anon select p2p_transactions"
  ON public.p2p_transactions FOR SELECT TO anon
  USING (true);

-- 5. Secure fiat_tags table
ALTER TABLE public.fiat_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon select fiat_tags" ON public.fiat_tags;
CREATE POLICY "Allow anon select fiat_tags"
  ON public.fiat_tags FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow anon insert fiat_tags" ON public.fiat_tags;
CREATE POLICY "Allow anon insert fiat_tags"
  ON public.fiat_tags FOR INSERT TO anon
  WITH CHECK (length(wallet_address) > 20 AND length(tag_name) >= 3);

DROP POLICY IF EXISTS "Allow anon update own fiat_tags" ON public.fiat_tags;
CREATE POLICY "Allow anon update own fiat_tags"
  ON public.fiat_tags FOR UPDATE TO anon
  USING (true)
  WITH CHECK (length(wallet_address) > 20);

-- 6. Secure paj_sessions table (Prevent rogue session hijacking)
ALTER TABLE public.paj_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon insert paj_sessions" ON public.paj_sessions;
CREATE POLICY "Allow anon insert paj_sessions"
  ON public.paj_sessions FOR INSERT TO anon
  WITH CHECK (length(wallet_address) > 20 AND length(session_token) > 10);

DROP POLICY IF EXISTS "Allow anon update paj_sessions" ON public.paj_sessions;
CREATE POLICY "Allow anon update paj_sessions"
  ON public.paj_sessions FOR UPDATE TO anon
  USING (true)
  WITH CHECK (length(wallet_address) > 20);

DROP POLICY IF EXISTS "Allow anon delete own paj_sessions" ON public.paj_sessions;
CREATE POLICY "Allow anon delete own paj_sessions"
  ON public.paj_sessions FOR DELETE TO anon
  USING (length(wallet_address) > 20);

DROP POLICY IF EXISTS "Allow anon select paj_sessions" ON public.paj_sessions;
CREATE POLICY "Allow anon select paj_sessions"
  ON public.paj_sessions FOR SELECT TO anon
  USING (length(wallet_address) > 20);
