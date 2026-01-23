-- Migration: Emergency Persistence & Thinking Steps Fixes
-- Creates project_files and fixes RLS and foreign keys

-- 1. Create project_files table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(site_id, path)
);

-- 2. Correct thinking_steps foreign key
-- The current schema incorrectly references 'conversations'. 
-- We re-link it to 'chat_sessions'.
ALTER TABLE IF EXISTS public.thinking_steps 
DROP CONSTRAINT IF EXISTS thinking_steps_conversation_id_fkey;

ALTER TABLE IF EXISTS public.thinking_steps
ADD CONSTRAINT thinking_steps_conversation_id_fkey 
FOREIGN KEY (conversation_id) REFERENCES chat_sessions(id) ON DELETE CASCADE;

-- 3. Add RLS for project_files
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access - project_files" ON public.project_files;
CREATE POLICY "Allow all access - project_files" ON public.project_files 
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Add RLS for thinking_steps
ALTER TABLE public.thinking_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access - thinking_steps" ON public.thinking_steps;
CREATE POLICY "Allow all access - thinking_steps" ON public.thinking_steps
  FOR ALL USING (true) WITH CHECK (true);

-- 5. Ensure is_cancelled column exists in chat_sessions
ALTER TABLE IF EXISTS public.chat_sessions 
ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT false;

-- 6. Add open RLS for chat_sessions and messages for development
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access - chat_sessions" ON public.chat_sessions;
CREATE POLICY "Allow all access - chat_sessions" ON public.chat_sessions
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access - messages" ON public.messages;
CREATE POLICY "Allow all access - messages" ON public.messages
  FOR ALL USING (true) WITH CHECK (true);

-- 7. Ensure publication for Realtime
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
  WHEN undefined_object THEN
    -- Publication might not exist in some local setups
    NULL;
END $$;

-- 8. Add unique constraint for upserting steps
-- First, clean up any existing duplicates (keep the most recent one by id)
DELETE FROM public.thinking_steps a
USING public.thinking_steps b
WHERE a.id < b.id 
  AND a.request_id = b.request_id 
  AND a.step_number = b.step_number;

CREATE UNIQUE INDEX IF NOT EXISTS idx_thinking_steps_request_step ON public.thinking_steps (request_id, step_number);


