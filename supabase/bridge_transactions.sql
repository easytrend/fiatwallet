-- =============================================================================
-- Fiatwallet Supabase schema — Dedicated Cross-Chain Bridge Transactions
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

-- 1. Create dedicated bridge_transactions table
CREATE TABLE IF NOT EXISTS public.bridge_transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_address     text UNIQUE NOT NULL,
  user_address        text NOT NULL,
  origin_chain        text NOT NULL,
  origin_symbol       text NOT NULL,
  destination_symbol  text NOT NULL DEFAULT 'USDC',
  deposit_amount      numeric(28, 8) NOT NULL DEFAULT 0,
  gross_amount        numeric(28, 8) NOT NULL DEFAULT 0,
  net_amount          numeric(28, 8) NOT NULL DEFAULT 0,
  protocol_fee        numeric(18, 6) NOT NULL DEFAULT 0,
  near_fee            text DEFAULT '0.27',
  refund_to           text,
  status              text NOT NULL DEFAULT 'PENDING',
  signature           text,
  correlation_id      text,
  time_estimate       integer DEFAULT 25,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 2. Performance indexes for lightning fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_bridge_tx_deposit_address ON public.bridge_transactions (deposit_address);
CREATE INDEX IF NOT EXISTS idx_bridge_tx_user_address ON public.bridge_transactions (user_address);
CREATE INDEX IF NOT EXISTS idx_bridge_tx_status ON public.bridge_transactions (status);
CREATE INDEX IF NOT EXISTS idx_bridge_tx_created_at ON public.bridge_transactions (created_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.bridge_transactions ENABLE ROW LEVEL SECURITY;

-- Allow reading bridge transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bridge_transactions' AND policyname = 'Allow public read of bridge_transactions'
  ) THEN
    CREATE POLICY "Allow public read of bridge_transactions"
      ON public.bridge_transactions
      FOR SELECT
      TO public
      USING (true);
  END IF;
END $$;

-- Allow inserting bridge transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bridge_transactions' AND policyname = 'Allow public insert of bridge_transactions'
  ) THEN
    CREATE POLICY "Allow public insert of bridge_transactions"
      ON public.bridge_transactions
      FOR INSERT
      TO public
      WITH CHECK (true);
  END IF;
END $$;

-- Allow updating bridge transactions (for relayer forward and status updates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bridge_transactions' AND policyname = 'Allow public update of bridge_transactions'
  ) THEN
    CREATE POLICY "Allow public update of bridge_transactions"
      ON public.bridge_transactions
      FOR UPDATE
      TO public
      USING (true);
  END IF;
END $$;

-- 4. Clean up any bridge records mistakenly logged into p2p_transactions
DELETE FROM public.p2p_transactions
WHERE transaction_type = 'bridge'
   OR signature LIKE 'pending_bridge_%';
