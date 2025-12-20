-- Base Schema Migration
-- Run this FIRST in Supabase SQL Editor

-- 1. Sites table (stores client websites)
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  default_branch TEXT DEFAULT 'main',
  stack TEXT DEFAULT 'unknown',
  allowed_paths_json JSONB DEFAULT '["src/styles/**", "theme/**", "src/components/ui/**"]'::jsonb,
  preview_subdomain TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Change requests table (tracks edit requests)
CREATE TABLE IF NOT EXISTS change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  request_id TEXT UNIQUE NOT NULL,
  instruction TEXT,
  plan_json JSONB,
  diff TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'preview_ready', 'applied', 'rolled_back', 'rejected')),
  preview_url TEXT,
  pr_url TEXT,
  commit_sha TEXT,
  revert_commit_sha TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Conversations table (chat history per site)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  messages_json JSONB DEFAULT '[]'::jsonb,
  summary TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(site_id, conversation_id)
);

-- 4. Agent memory table (stores preferences per site)
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(site_id, key)
);

-- 5. Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  payload_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Preview deployments table
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

-- 7. Create indexes
CREATE INDEX IF NOT EXISTS idx_change_requests_request_id ON change_requests(request_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_site_id ON change_requests(site_id);
CREATE INDEX IF NOT EXISTS idx_preview_deployments_request_id ON preview_deployments(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_site_id ON audit_logs(site_id);

-- 8. Enable RLS on all tables
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE preview_deployments ENABLE ROW LEVEL SECURITY;

-- 9. Service role policies (n8n uses service role)
CREATE POLICY "Service role full access - sites" ON sites FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access - change_requests" ON change_requests FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access - conversations" ON conversations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access - agent_memory" ON agent_memory FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access - audit_logs" ON audit_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access - preview_deployments" ON preview_deployments FOR ALL USING (auth.role() = 'service_role');

-- 10. Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 11. Apply trigger to tables with updated_at (drop first to make idempotent)
DROP TRIGGER IF EXISTS update_sites_updated_at ON sites;
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
DROP TRIGGER IF EXISTS update_agent_memory_updated_at ON agent_memory;
DROP TRIGGER IF EXISTS update_preview_deployments_updated_at ON preview_deployments;

CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON sites FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_memory_updated_at BEFORE UPDATE ON agent_memory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_preview_deployments_updated_at BEFORE UPDATE ON preview_deployments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 12. Insert demo site (run manually if needed)
-- INSERT INTO sites (id, name, repo_url, default_branch, stack, preview_subdomain)
-- VALUES (gen_random_uuid(), 'Demo Store', 'https://github.com/your-org/demo-store', 'main', 'nextjs', 'demo');
