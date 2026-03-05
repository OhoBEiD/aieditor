-- Project Brain: Persistent knowledge base for AI agents
-- Stores learned patterns, preferences, and architectural decisions per project
-- Used by src/lib/ai/context/brain.ts

CREATE TABLE IF NOT EXISTS project_brain (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('pattern', 'preference', 'mistake', 'architecture', 'component')),
    content TEXT NOT NULL,
    confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_used_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_brain_project_id ON project_brain(project_id);
CREATE INDEX IF NOT EXISTS idx_project_brain_category ON project_brain(project_id, category);

-- RLS: Allow service role full access (brain is server-side only)
ALTER TABLE project_brain ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on project_brain"
    ON project_brain
    FOR ALL
    USING (true)
    WITH CHECK (true);
