-- Preview System Schema Migration
-- Run this in Supabase SQL Editor

-- 1. Add preview_subdomain to sites table
ALTER TABLE sites ADD COLUMN IF NOT EXISTS preview_subdomain TEXT UNIQUE;

-- 2. Create preview_deployments table
CREATE TABLE IF NOT EXISTS preview_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  deployment_id TEXT,
  preview_url TEXT,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'building', 'ready', 'error', 'cancelled')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_preview_deployments_request_id ON preview_deployments(request_id);
CREATE INDEX IF NOT EXISTS idx_preview_deployments_site_id ON preview_deployments(site_id);

-- 4. Enable RLS
ALTER TABLE preview_deployments ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (adjust based on your auth setup)
CREATE POLICY "Service role can manage preview_deployments"
  ON preview_deployments FOR ALL
  USING (auth.role() = 'service_role');

-- 6. Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_preview_deployments_updated_at
  BEFORE UPDATE ON preview_deployments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. Sample data (optional - remove in production)
-- INSERT INTO sites (id, name, repo_url, default_branch, stack, preview_subdomain)
-- VALUES (
--   gen_random_uuid(),
--   'Demo Ecom Store',
--   'https://github.com/your-org/demo-store',
--   'main',
--   'nextjs',
--   'demo-store'
-- );
