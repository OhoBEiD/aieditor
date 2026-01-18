# Executor Mode Fix

## Problem
When users select "Fast" or "Thinking" mode in the UI, the workflow was still routing to the wrong executor due to pattern matching overriding the user's selection.

## Solution
Created V42 workflow with a simplified **Input Router** approach:

1. **Removed**: Planning Agent and Parse Plan nodes
2. **Added**: Input Router that reads `executor_mode` from the messages table
3. **Direct Routing**: Based purely on user's selection, not pattern matching

## How It Works

```
User selects mode → Frontend saves to messages.executor_mode
                  → n8n reads from database
                  → Routes to correct executor
```

| Mode | Executor | Use Case |
|------|----------|----------|
| `fast` | Simple Executor (Haiku) | Quick text changes |
| `thinking` | Complex Executor (Sonnet) | Complex tasks, new pages |
| `auto` | Smart detection | Let AI decide |

## Deployment Steps

### 1. Run Database Migration
```sql
-- In Supabase SQL Editor, run:
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS executor_mode VARCHAR(20) DEFAULT 'auto';

ALTER TABLE public.messages 
ADD CONSTRAINT messages_executor_mode_check 
CHECK (executor_mode IN ('auto', 'fast', 'thinking'));
```

### 2. Import Workflow
1. Open n8n: https://n8n-ai-editor.fly.dev
2. Import `FIXED-AGENT-WORKFLOW-V42.json`
3. Activate the workflow

### 3. Verify
- Select "Fast" mode → Should use Simple Executor (fast response)
- Select "Thinking" mode → Should use Complex Executor (detailed response)

## Files Changed
- `n8n/FIXED-AGENT-WORKFLOW-V42.json` - New workflow
- `migrations/add_executor_mode_to_messages.sql` - DB migration
