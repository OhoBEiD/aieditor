-- Store Supabase Management API OAuth tokens per user
-- Used for listing user's Supabase projects and auto-fetching API keys
CREATE TABLE IF NOT EXISTS public.supabase_management_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT DEFAULT 'bearer',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.supabase_management_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access - supabase_management_tokens"
  ON public.supabase_management_tokens
  FOR ALL
  USING (true);

-- Add project_ref column to supabase_connections for Management API lookups
ALTER TABLE public.supabase_connections
  ADD COLUMN IF NOT EXISTS project_ref TEXT;
