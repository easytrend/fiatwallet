-- =============================================================================
-- Migration: Anti-Fraud and Security Lockdown (2026-11-26)
-- Run this in the Supabase Dashboard: SQL Editor -> New Query -> Run
-- =============================================================================

-- ── 1. TEMPORARILY DETACH OLD TRIGGERS ───────────────────────────────────────
-- Detach triggers first so historical fraud rows can be updated/neutralized
-- without trigger conflicts or self-interfering compliance checks.
DROP TRIGGER IF EXISTS trg_capture_client_metadata_p2p ON public.p2p_transactions;
DROP TRIGGER IF EXISTS trg_capture_client_metadata_sessions ON public.paj_sessions;

-- ── 2. NEUTRALIZE KNOWN ATTACKER ORDERS & CLEAN UP PROBES ────────────────────
-- Neutralize the Nov 25 curl probe order
UPDATE public.p2p_transactions 
  SET status = 'REJECTED_PROBE', 
      signature = 'REJECTED_PROBE_159.195.249.251',
      deposit_address = 'REJECTED: Unauthorized external curl probe'
  WHERE order_id = '6b07280bdc0851b14ebe8dac';

-- Reconcile Nov 6 order (settled on PajCash developer portal, ₦26,000 paid, delivered on-chain to $ultradefi)
UPDATE public.p2p_transactions 
  SET user_address = '8JdQg7rmUUoApHitvDcAznf7ZCqpuTUeB5XKJ6qQYNsp',
      status = 'COMPLETED', 
      signature = 'q9JQVAGL94X4DWhRngxpU7J5Jb8PK4t67ivb5eKZt9mH3Fx17NXXh7VSFEhu7VrPtFdZDbdyba51iBW1N81uXzn',
      deposit_address = 'FORWARDED_SUCCESS'
  WHERE order_id = '6aed85523eaff631a9e7eb52';

-- Remove any session rows associated with the attacker's wallets or test probes
DELETE FROM public.paj_sessions 
  WHERE wallet_address IN ('8YWmU7FNZJxREyioU36Tqga2UifeYNUJUe9GhbyV3njc', '6obmHBMC5Qf2KrJmmVKjPZ8WY7Hq99wje3ZTwzuNqbDx')
     OR wallet_address LIKE 'test_%' 
     OR wallet_address LIKE 'TEST%' 
     OR email LIKE '%@example.com';

-- Force re-verification across all user accounts (including $ultradefi) and destroy old token strings
UPDATE public.paj_sessions 
  SET expires_at = now() - interval '1 hour',
      session_token = 'EXPIRED_' || replace(gen_random_uuid()::text, '-', ''),
      updated_at = now();

-- Remove any probe transactions
DELETE FROM public.p2p_transactions 
  WHERE order_id LIKE 'test_%' 
     OR order_id LIKE 'mock_%' 
     OR user_address LIKE 'test_%';

-- Remove any probe wallets
DELETE FROM public.wallets 
  WHERE wallet_address LIKE '%Probe%' 
     OR wallet_address LIKE 'test_%' 
     OR wallet_address = 'SwarmProbe1111111111111111111111111111111';

-- ── 3. INSTALL HARDENED CLIENT METADATA & COMPLIANCE TRIGGER ─────────────────
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

  -- Detect caller authentication role (PostgREST JWT claim)
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

    -- Block blacklisted wallet addresses on paj_sessions
    IF NEW.wallet_address IN ('8YWmU7FNZJxREyioU36Tqga2UifeYNUJUe9GhbyV3njc', '6obmHBMC5Qf2KrJmmVKjPZ8WY7Hq99wje3ZTwzuNqbDx') THEN
      RAISE EXCEPTION 'Access Denied: Compliance violation on wallet %', NEW.wallet_address;
    END IF;
  END IF;

  -- ── RULE 4: Validate Solana user address on p2p_transactions ───────────────
  IF TG_TABLE_NAME = 'p2p_transactions' THEN
    IF NEW.user_address IS NOT NULL AND (length(NEW.user_address) < 32 OR length(NEW.user_address) > 44 
       OR NEW.user_address !~ '^[1-9A-HJ-NP-Za-km-z]+$') THEN
      RAISE EXCEPTION 'Invalid Solana user address format: %', NEW.user_address;
    END IF;

    -- Block blacklisted wallet addresses from creating new transactions or changing to a blacklisted address
    IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.user_address IS DISTINCT FROM NEW.user_address)) THEN
      IF NEW.user_address IN ('8YWmU7FNZJxREyioU36Tqga2UifeYNUJUe9GhbyV3njc', '6obmHBMC5Qf2KrJmmVKjPZ8WY7Hq99wje3ZTwzuNqbDx') THEN
        RAISE EXCEPTION 'Access Denied: Compliance violation on wallet %', NEW.user_address;
      END IF;
    END IF;

    -- Block anonymous client API calls from modifying blacklisted rows
    IF TG_OP = 'UPDATE' AND req_role = 'anon' 
       AND NEW.user_address IN ('8YWmU7FNZJxREyioU36Tqga2UifeYNUJUe9GhbyV3njc', '6obmHBMC5Qf2KrJmmVKjPZ8WY7Hq99wje3ZTwzuNqbDx') THEN
      RAISE EXCEPTION 'Access Denied: Compliance violation on wallet %', NEW.user_address;
    END IF;

    -- ── RULE 5: Anon clients can NEVER mark onramps as COMPLETED ────────────
    -- Only backend service_role (webhooks/relayer) can finalize onramp completion
    IF req_role = 'anon' THEN
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
CREATE TRIGGER trg_capture_client_metadata_p2p
  BEFORE INSERT OR UPDATE ON public.p2p_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_client_metadata();

-- Reattach trigger to paj_sessions
CREATE TRIGGER trg_capture_client_metadata_sessions
  BEFORE INSERT OR UPDATE ON public.paj_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_client_metadata();

-- ── 4. REVOKE DANGEROUS PERMISSIONS FROM PUBLIC/ANON ─────────────────────────
REVOKE DELETE ON TABLE public.p2p_transactions FROM anon;
REVOKE DELETE ON TABLE public.paj_sessions FROM anon;
REVOKE DELETE ON TABLE public.fiat_tags FROM anon;
REVOKE DELETE ON TABLE public.wallets FROM anon;

-- ── 5. PREVENT SESSION SCRAPING & USER EMAIL HARVESTING ──────────────────────
-- Create a secure RPC lookup that ONLY returns the session for the specific connected wallet.
CREATE OR REPLACE FUNCTION public.get_paj_session(lookup_wallet text)
RETURNS TABLE (
  email text,
  session_token text,
  expires_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT s.email, s.session_token, s.expires_at
  FROM public.paj_sessions s
  WHERE s.wallet_address = lookup_wallet
    AND s.expires_at > now()
  ORDER BY s.updated_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_paj_session(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_paj_session(text) TO authenticated;

-- Revoke broad SELECT on paj_sessions from anon (Stops all user session and email scraping)
REVOKE SELECT ON TABLE public.paj_sessions FROM anon;
DROP POLICY IF EXISTS "Allow anon select paj_sessions" ON public.paj_sessions;


-- ── 6. LOCK FIAT TAGS (PREVENT TAMPERING & HIJACKING) ────────────────────────
CREATE OR REPLACE FUNCTION public.protect_fiat_tags_lock()
RETURNS trigger AS $$
DECLARE
  req_role text;
BEGIN
  BEGIN
    req_role := current_setting('request.jwt.claim.role', true);
  EXCEPTION WHEN OTHERS THEN
    req_role := NULL;
  END;

  -- Prevent altering wallet_address or tag_name on an existing tag
  IF OLD.wallet_address IS DISTINCT FROM NEW.wallet_address THEN
    RAISE EXCEPTION 'Fiat Tag wallet address is permanently bound and cannot be changed.';
  END IF;
  
  IF OLD.tag_name IS DISTINCT FROM NEW.tag_name THEN
    RAISE EXCEPTION 'Fiat Tag name is permanently locked and cannot be changed.';
  END IF;

  -- If bank account was already set, prevent altering it from client/anon
  IF req_role = 'anon' AND OLD.account_number IS NOT NULL AND OLD.account_number IS DISTINCT FROM NEW.account_number THEN
    RAISE EXCEPTION 'Bank details are locked for security. Contact support to request modifications.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_fiat_tags_lock ON public.fiat_tags;
CREATE TRIGGER trg_protect_fiat_tags_lock
  BEFORE UPDATE ON public.fiat_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_fiat_tags_lock();
