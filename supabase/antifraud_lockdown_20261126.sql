-- =============================================================================
-- Migration: Anti-Fraud and Security Lockdown (2026-11-26)
-- Run this in the Supabase Dashboard: SQL Editor -> New Query -> Run
-- =============================================================================

-- 1. Upgrade client metadata and security trigger
CREATE OR REPLACE FUNCTION public.capture_client_metadata()
RETURNS trigger AS $$
DECLARE
  headers json;
  client_ip text;
  client_ua text;
  req_role text;
BEGIN
  -- Extract HTTP headers passed down by PostgREST
  BEGIN
    headers := current_setting('request.headers', true)::json;
    IF headers IS NOT NULL THEN
      client_ip := coalesce(
        headers->>'cf-connecting-ip',
        split_part(headers->>'x-forwarded-for', ',', 1)
      );
      client_ua := headers->>'user-agent';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    client_ip := NULL;
    client_ua := NULL;
  END;

  -- Detect caller authentication role
  BEGIN
    req_role := current_setting('request.jwt.claim.role', true);
  EXCEPTION WHEN OTHERS THEN
    req_role := NULL;
  END;

  -- ── RULE 1: Block known attacker / malicious IPs ───────────────────────────
  IF client_ip IS NOT NULL AND client_ip IN ('159.195.249.251') THEN
    RAISE EXCEPTION 'Access Denied: Blocked IP address (%)', client_ip;
  END IF;

  -- ── RULE 2: Block automated CLI tools (curl, python, postman, insomnia) ────
  IF client_ua IS NOT NULL AND client_ua ~* '^(curl|python|postman|insomnia|httpie)' THEN
    RAISE EXCEPTION 'Access Denied: Automated CLI tools are prohibited';
  END IF;

  -- ── RULE 3: Validate Solana wallet format on paj_sessions ──────────────────
  IF TG_TABLE_NAME = 'paj_sessions' THEN
    IF NEW.wallet_address IS NULL OR length(NEW.wallet_address) < 32 OR length(NEW.wallet_address) > 44 
       OR NEW.wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]+$' THEN
      RAISE EXCEPTION 'Invalid Solana wallet address format: %', NEW.wallet_address;
    END IF;
    IF NEW.session_token IS NULL OR length(trim(NEW.session_token)) < 15 THEN
      RAISE EXCEPTION 'Invalid or insufficient session token';
    END IF;
  END IF;

  -- ── RULE 4: Validate Solana user address on p2p_transactions ───────────────
  IF TG_TABLE_NAME = 'p2p_transactions' THEN
    IF NEW.user_address IS NOT NULL AND (length(NEW.user_address) < 32 OR length(NEW.user_address) > 44 
       OR NEW.user_address !~ '^[1-9A-HJ-NP-Za-km-z]+$') THEN
      RAISE EXCEPTION 'Invalid Solana user address format: %', NEW.user_address;
    END IF;

    -- Block blacklisted wallet addresses from creating transactions
    IF NEW.user_address IN ('8YWmU7FNZJxREyioU36Tqga2UifeYNUJUe9GhbyV3njc', '6obmHBMC5Qf2KrJmmVKjPZ8WY7Hq99wje3ZTwzuNqbDx') THEN
      RAISE EXCEPTION 'Access Denied: Compliance violation on wallet %', NEW.user_address;
    END IF;

    -- ── RULE 5: Anon clients can NEVER mark onramps as COMPLETED ────────────
    -- Only backend service_role (webhooks/relayer) can finalize onramp completion
    IF req_role = 'anon' OR req_role IS NULL THEN
      IF NEW.transaction_type = 'p2p_onramp' AND (NEW.status = 'COMPLETED' OR NEW.status = 'FORWARDED_SUCCESS') THEN
        NEW.status := 'INIT';
      END IF;
      IF NEW.deposit_address = 'RELAYER_FORWARDED' THEN
        NEW.deposit_address := NULL;
      END IF;
    END IF;
  END IF;

  -- Populate client metadata if not explicitly provided
  IF NEW.ip_address IS NULL AND client_ip IS NOT NULL THEN
    NEW.ip_address := client_ip;
  END IF;
  
  IF NEW.user_agent IS NULL AND client_ua IS NOT NULL THEN
    NEW.user_agent := client_ua;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reattach trigger to p2p_transactions
DROP TRIGGER IF EXISTS trg_capture_client_metadata_p2p ON public.p2p_transactions;
CREATE TRIGGER trg_capture_client_metadata_p2p
  BEFORE INSERT OR UPDATE ON public.p2p_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_client_metadata();

-- Reattach trigger to paj_sessions
DROP TRIGGER IF EXISTS trg_capture_client_metadata_sessions ON public.paj_sessions;
CREATE TRIGGER trg_capture_client_metadata_sessions
  BEFORE INSERT OR UPDATE ON public.paj_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_client_metadata();

-- 2. Clean up any leftover bogus probe and test rows
DELETE FROM public.paj_sessions WHERE wallet_address LIKE 'test_%' OR wallet_address LIKE 'TEST%' OR email LIKE '%@example.com';
DELETE FROM public.p2p_transactions WHERE order_id LIKE 'test_%' OR order_id LIKE 'mock_%' OR user_address LIKE 'test_%';
UPDATE public.p2p_transactions 
  SET status = 'REJECTED_PROBE', 
      signature = 'REJECTED_PROBE_159.195.249.251',
      deposit_address = 'REJECTED: Unauthorized external curl probe'
  WHERE order_id = '6b07280bdc0851b14ebe8dac';

-- 3. Revoke dangerous permissions from public/anon
REVOKE DELETE ON TABLE public.p2p_transactions FROM anon;
REVOKE DELETE ON TABLE public.paj_sessions FROM anon;
REVOKE DELETE ON TABLE public.fiat_tags FROM anon;
