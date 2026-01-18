-- Add executor_mode column to messages table
-- This stores the user's selected mode (auto, fast, thinking) for each message

-- Add the column
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS executor_mode VARCHAR(20) DEFAULT 'auto';

-- Add a check constraint to ensure valid values
ALTER TABLE public.messages 
ADD CONSTRAINT messages_executor_mode_check 
CHECK (executor_mode IN ('auto', 'fast', 'thinking'));

-- Create an index for filtering by mode
CREATE INDEX IF NOT EXISTS idx_messages_executor_mode 
ON public.messages USING btree (executor_mode) TABLESPACE pg_default;

-- Add a comment
COMMENT ON COLUMN public.messages.executor_mode IS 'User-selected executor mode: auto (AI decides), fast (Simple Executor), thinking (Complex Executor)';
