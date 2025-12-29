-- Thinking Steps Table for Live AI Agent Updates
-- Run this in your Supabase SQL Editor

-- Create thinking_steps table
CREATE TABLE IF NOT EXISTS thinking_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id TEXT NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  tool_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'complete', 'error')),
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_thinking_steps_request_id ON thinking_steps(request_id);
CREATE INDEX IF NOT EXISTS idx_thinking_steps_conversation_id ON thinking_steps(conversation_id);
CREATE INDEX IF NOT EXISTS idx_thinking_steps_created_at ON thinking_steps(created_at DESC);

-- Enable Row Level Security
ALTER TABLE thinking_steps ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all for now, restrict based on your auth needs)
CREATE POLICY "Allow all operations on thinking_steps" ON thinking_steps
  FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime for thinking_steps table
ALTER PUBLICATION supabase_realtime ADD TABLE thinking_steps;

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_thinking_steps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_thinking_steps_timestamp
  BEFORE UPDATE ON thinking_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_thinking_steps_updated_at();

-- Function to clean up old thinking steps (optional - keeps last 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_thinking_steps()
RETURNS void AS $$
BEGIN
  DELETE FROM thinking_steps
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (optional - requires pg_cron extension)
-- SELECT cron.schedule('cleanup-thinking-steps', '0 2 * * *', 'SELECT cleanup_old_thinking_steps()');
