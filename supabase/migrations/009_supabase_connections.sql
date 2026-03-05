-- Supabase connections: stores user's own Supabase project credentials per site
CREATE TABLE IF NOT EXISTS public.supabase_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE UNIQUE,
  project_url TEXT NOT NULL,
  anon_key TEXT NOT NULL,
  service_role_key TEXT,
  schema_cache JSONB DEFAULT '{}',
  is_connected BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.supabase_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access - supabase_connections"
  ON public.supabase_connections
  FOR ALL
  USING (true);
