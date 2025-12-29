-- Migration: GitHub OAuth & Auth System
-- Run this in Supabase SQL Editor

-- 1. Create github_tokens table to store user's GitHub access tokens
CREATE TABLE IF NOT EXISTS public.github_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scope TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.github_tokens ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Users can only access their own tokens
CREATE POLICY "Users can access own github tokens" ON public.github_tokens
  FOR ALL USING (auth.uid() = user_id);

-- 4. Service role full access
CREATE POLICY "Service role full access - github_tokens" ON public.github_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- 5. Trigger for updated_at
DROP TRIGGER IF EXISTS update_github_tokens_updated_at ON public.github_tokens;
CREATE TRIGGER update_github_tokens_updated_at 
  BEFORE UPDATE ON public.github_tokens 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Update sites.user_id to reference auth.users (if not already done)
-- First drop the old constraint if it exists
ALTER TABLE public.sites DROP CONSTRAINT IF EXISTS sites_user_id_fkey;

-- Add new constraint referencing auth.users
ALTER TABLE public.sites 
  ADD CONSTRAINT sites_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 7. Index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_github_tokens_user_id ON public.github_tokens(user_id);
