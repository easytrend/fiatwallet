-- =============================================================================
-- Supabase Schema Migration: Fiat Tags KYC Fields (BVN, Phone Number, NIN)
-- =============================================================================
-- Run this script in your Supabase SQL Editor:
-- Dashboard -> SQL Editor -> New Query -> Paste & Run
-- =============================================================================

ALTER TABLE public.fiat_tags 
  ADD COLUMN IF NOT EXISTS bvn TEXT,
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS nin TEXT;

-- Performance indexes for identity lookups and deduplication
CREATE INDEX IF NOT EXISTS idx_fiat_tags_bvn ON public.fiat_tags (bvn);
CREATE INDEX IF NOT EXISTS idx_fiat_tags_phone ON public.fiat_tags (phone_number);
CREATE INDEX IF NOT EXISTS idx_fiat_tags_nin ON public.fiat_tags (nin);
