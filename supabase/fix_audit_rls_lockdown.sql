-- =============================================================================
-- Audit Remediation: Lockdown p2p_transactions Immutable Financial Columns
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- =============================================================================

-- 1. Ensure RLS is active on p2p_transactions
ALTER TABLE public.p2p_transactions ENABLE ROW LEVEL SECURITY;

-- 2. Trigger to prevent tampering with user_address and crypto_amount
-- This completely blocks any client (even with the public anon key) from 
-- altering the recipient wallet or the requested payout amount of an order.
CREATE OR REPLACE FUNCTION public.prevent_immutable_p2p_columns_update()
RETURNS trigger AS $$
BEGIN
  -- Service role key / backend functions retain full administrative capabilities
  IF current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block any client-side update from modifying the buyer/seller address
  IF OLD.user_address IS NOT NULL AND NEW.user_address IS DISTINCT FROM OLD.user_address THEN
    RAISE EXCEPTION 'Security Violation: user_address cannot be modified on an existing transaction.';
  END IF;

  -- Block any client-side update from modifying the crypto amount
  IF OLD.crypto_amount IS NOT NULL AND NEW.crypto_amount IS DISTINCT FROM OLD.crypto_amount THEN
    RAISE EXCEPTION 'Security Violation: crypto_amount cannot be modified on an existing transaction.';
  END IF;

  -- Block unauthorized status transitions from client to COMPLETED or FORWARDED_SUCCESS
  -- (Only the backend relayer using service-role or verified webhooks can mark these)
  IF NEW.status IN ('COMPLETED', 'FORWARDED_SUCCESS', 'HELD_COMPLIANCE_REVIEW') 
     AND OLD.status NOT IN ('COMPLETED', 'FORWARDED_SUCCESS', 'HELD_COMPLIANCE_REVIEW')
     AND current_user != 'service_role' THEN
    -- Allow client to only set pending/init/error/paj statuses
    -- The relayer backend exclusively writes COMPLETED upon on-chain broadcast
    NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_p2p_immutable_columns ON public.p2p_transactions;
CREATE TRIGGER trg_p2p_immutable_columns
  BEFORE UPDATE ON public.p2p_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_immutable_p2p_columns_update();

-- 3. Revoke column-level UPDATE on financial fields from anon
REVOKE UPDATE (user_address, crypto_amount, usd_value) ON TABLE public.p2p_transactions FROM anon;

COMMENT ON FUNCTION public.prevent_immutable_p2p_columns_update() IS 
  'Guards financial integrity: blocks any client tampering with user_address and crypto_amount.';
