-- Migration: Upgrade agent_memory table structure
-- Transforms from simple key-value store to structured memory system

-- Drop existing table and recreate with new structure
-- WARNING: This will delete all existing agent_memory data
DROP TABLE IF EXISTS public.agent_memory CASCADE;

-- Agent memory for AI context and learning
CREATE TABLE public.agent_memory (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id text NOT NULL,  -- Site key (e.g., site_1767194191645_28jh2xl)
  session_id uuid NULL,  -- Optional: which chat session
  memory_type character varying(50) NOT NULL,
  content text NOT NULL,
  content_json jsonb NULL,  -- Structured data (file paths, code snippets, etc.)
  sequence_number integer NOT NULL DEFAULT 0,  -- For ordering within type
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),

  CONSTRAINT agent_memory_pkey PRIMARY KEY (id),
  CONSTRAINT agent_memory_memory_type_check CHECK (
    memory_type::text = ANY (ARRAY[
      'conversation',    -- User request + AI response summary
      'file_change',     -- What files were created/modified
      'preference',      -- User style preferences learned over time
      'context',         -- Project context (tech stack, patterns used)
      'error',           -- Errors encountered and how they were fixed
      'instruction'      -- Explicit user instructions to remember
    ]::text[])
  )
);

-- Indexes for efficient querying
CREATE INDEX idx_agent_memory_project ON public.agent_memory USING btree (project_id);
CREATE INDEX idx_agent_memory_project_type ON public.agent_memory USING btree (project_id, memory_type);
CREATE INDEX idx_agent_memory_project_session ON public.agent_memory USING btree (project_id, session_id);
CREATE INDEX idx_agent_memory_created ON public.agent_memory USING btree (project_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

-- Service role policy
DROP POLICY IF EXISTS "Service role full access - agent_memory" ON agent_memory;
CREATE POLICY "Service role full access - agent_memory" ON agent_memory FOR ALL USING (auth.role() = 'service_role');

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_agent_memory_updated_at ON agent_memory;
CREATE TRIGGER update_agent_memory_updated_at
  BEFORE UPDATE ON agent_memory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
