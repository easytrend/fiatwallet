-- Migration: Add automated IP and Device (User-Agent) tracking to p2p_transactions and paj_sessions
-- PostgREST automatically exposes request HTTP headers in the GUC 'request.headers'.
-- This trigger captures the real connecting IP (cf-connecting-ip / x-forwarded-for) and user-agent
-- completely server-side without altering any frontend onramp/offramp code.

ALTER TABLE public.p2p_transactions 
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text;

ALTER TABLE public.paj_sessions 
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text;

-- Helper function to extract headers safely from PostgREST request context
CREATE OR REPLACE FUNCTION public.capture_client_metadata()
RETURNS trigger AS $$
DECLARE
  headers json;
  client_ip text;
  client_ua text;
BEGIN
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

  IF NEW.ip_address IS NULL AND client_ip IS NOT NULL THEN
    NEW.ip_address := client_ip;
  END IF;
  
  IF NEW.user_agent IS NULL AND client_ua IS NOT NULL THEN
    NEW.user_agent := client_ua;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to p2p_transactions
DROP TRIGGER IF EXISTS trg_capture_client_metadata_p2p ON public.p2p_transactions;
CREATE TRIGGER trg_capture_client_metadata_p2p
  BEFORE INSERT OR UPDATE ON public.p2p_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_client_metadata();

-- Attach trigger to paj_sessions
DROP TRIGGER IF EXISTS trg_capture_client_metadata_sessions ON public.paj_sessions;
CREATE TRIGGER trg_capture_client_metadata_sessions
  BEFORE INSERT OR UPDATE ON public.paj_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_client_metadata();
