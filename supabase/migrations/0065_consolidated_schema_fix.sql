-- Migration 006b: Consolidated Schema Fix
-- Creates tables that existed on hosted Supabase but were missing from migration files.
-- Must run AFTER 006 and BEFORE 007/008 (which ALTER these tables).

-- ============================================================
-- 1. CLIENTS TABLE
-- Referenced by types.ts, stores API client accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  domain TEXT,
  api_key TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access - clients" ON public.clients;
CREATE POLICY "Allow all access - clients" ON public.clients
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. CHAT_SESSIONS TABLE
-- Core table: 25+ code references, stores conversation sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT,
  title TEXT DEFAULT 'New Chat',
  is_active BOOLEAN DEFAULT true,
  is_cancelled BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_client_id ON public.chat_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_active ON public.chat_sessions(client_id, is_active);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access - chat_sessions" ON public.chat_sessions;
CREATE POLICY "Allow all access - chat_sessions" ON public.chat_sessions
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON public.chat_sessions;
CREATE TRIGGER update_chat_sessions_updated_at
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. MESSAGES TABLE
-- Core table: 15+ code references, stores chat messages per session
-- ============================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON public.messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(session_id, created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access - messages" ON public.messages;
CREATE POLICY "Allow all access - messages" ON public.messages
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 4. THINKING_STEPS TABLE
-- Agent progress tracking, uses Supabase Realtime for live updates
-- FK to chat_sessions (not conversations — migration 008 also fixes this)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.thinking_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  conversation_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  tool_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'complete', 'error')),
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thinking_steps_request_id ON public.thinking_steps(request_id);
CREATE INDEX IF NOT EXISTS idx_thinking_steps_conversation_id ON public.thinking_steps(conversation_id);
CREATE INDEX IF NOT EXISTS idx_thinking_steps_created_at ON public.thinking_steps(created_at DESC);

ALTER TABLE public.thinking_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access - thinking_steps" ON public.thinking_steps;
CREATE POLICY "Allow all access - thinking_steps" ON public.thinking_steps
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_thinking_steps_updated_at ON public.thinking_steps;
CREATE TRIGGER update_thinking_steps_updated_at
  BEFORE UPDATE ON public.thinking_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Realtime for thinking_steps
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'thinking_steps'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE thinking_steps;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- ============================================================
-- 5. CODE_VERSIONS TABLE
-- File change history per session for revert functionality
-- ============================================================
CREATE TABLE IF NOT EXISTS public.code_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  session_id UUID REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'modify', 'delete')),
  previous_content TEXT,
  new_content TEXT,
  change_description TEXT,
  change_data JSONB,
  is_applied BOOLEAN DEFAULT true,
  is_reverted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_code_versions_session ON public.code_versions(session_id);
CREATE INDEX IF NOT EXISTS idx_code_versions_client ON public.code_versions(client_id);

ALTER TABLE public.code_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access - code_versions" ON public.code_versions;
CREATE POLICY "Allow all access - code_versions" ON public.code_versions
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 6. UPLOADED_ASSETS TABLE
-- File uploads (images, etc.) linked to client
-- ============================================================
CREATE TABLE IF NOT EXISTS public.uploaded_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  storage_url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uploaded_assets_client ON public.uploaded_assets(client_id);

ALTER TABLE public.uploaded_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access - uploaded_assets" ON public.uploaded_assets;
CREATE POLICY "Allow all access - uploaded_assets" ON public.uploaded_assets
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 7. EVENT_LOGS TABLE
-- Application event logging with token tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT,
  event_type TEXT NOT NULL,
  workflow_name TEXT,
  action TEXT,
  duration_ms INTEGER,
  tokens_used INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_logs_client ON public.event_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_type ON public.event_logs(event_type);

ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access - event_logs" ON public.event_logs;
CREATE POLICY "Allow all access - event_logs" ON public.event_logs
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 8. VIEW: v_chat_sessions_summary
-- Joins chat_sessions with message counts for sidebar display
-- ============================================================
CREATE OR REPLACE VIEW public.v_chat_sessions_summary AS
SELECT
  cs.id,
  cs.client_id,
  cs.title,
  cs.is_active,
  cs.created_at,
  cs.updated_at,
  COALESCE(msg.message_count, 0) AS message_count,
  msg.last_message_at
FROM public.chat_sessions cs
LEFT JOIN (
  SELECT
    session_id,
    COUNT(*) AS message_count,
    MAX(created_at) AS last_message_at
  FROM public.messages
  GROUP BY session_id
) msg ON msg.session_id = cs.id;
