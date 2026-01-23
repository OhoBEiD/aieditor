-- Migration: Project Persistence and Session Cancellation
-- Adds support for saving WebContainer state and stopping agent runs

-- 1. Add is_cancelled to chat_sessions for the Stop button
ALTER TABLE IF EXISTS public.chat_sessions 
ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT false;

-- 2. Create project_files table for WebContainer state persistence
CREATE TABLE IF NOT EXISTS public.project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(site_id, path)
);

-- 3. Enable RLS
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

-- 4. Service role policy
DROP POLICY IF EXISTS "Service role full access - project_files" ON public.project_files;
CREATE POLICY "Service role full access - project_files" ON public.project_files FOR ALL USING (auth.role() = 'service_role');

-- 5. Updated_at trigger
CREATE TRIGGER update_project_files_updated_at
  BEFORE UPDATE ON public.project_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
