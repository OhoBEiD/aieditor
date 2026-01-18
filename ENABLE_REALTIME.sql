-- Enable Realtime for thinking_steps table
-- Run this in Supabase SQL Editor

-- 1. Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE thinking_steps;

-- 2. Enable Row Level Security (RLS) - Required for realtime
ALTER TABLE thinking_steps ENABLE ROW LEVEL SECURITY;

-- 3. Add policy to allow everyone to read thinking steps
-- (You can make this more restrictive later if needed)
CREATE POLICY "Allow public read access to thinking steps"
  ON thinking_steps
  FOR SELECT
  USING (true);

-- 4. Optional: Add policy for inserting (if n8n needs to insert via service_role, this isn't needed)
-- CREATE POLICY "Allow service role to insert thinking steps"
--   ON thinking_steps
--   FOR INSERT
--   WITH CHECK (true);

-- 5. Verify it's enabled
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename = 'thinking_steps';

-- Expected output: Should show thinking_steps table
