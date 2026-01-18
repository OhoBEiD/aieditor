# Executor Mode Fix - V42 Workflow

## Problem
The n8n workflow was ignoring the user's selected executor mode (Fast/Thinking/Auto) and always routing to the Complex Executor based on pattern matching instead of the user's explicit choice.

## Root Cause
The workflow had unnecessary complexity:
1. **Planning Agent** - Used pattern matching to determine if task was simple or complex
2. **Complexity Router** - Routed based on `isComplex` boolean from pattern matching
3. The `executorMode` from the database was being passed through but not actually used for routing

## Solution - V42 Workflow

### Changes Made
1. **Removed** Planning Agent node (unnecessary classification)
2. **Removed** Parse Plan node (unnecessary processing)
3. **Replaced** Complexity Router with **Input Router**
4. **Enhanced** Check Request Cache to fetch `executor_mode` from messages table
5. **Input Router** now routes directly based on user's `executor_mode`:
   - `"fast"` → Simple Executor (Haiku, fast, fewer tools)
   - `"thinking"` → Complex Executor (Sonnet, slower, all tools)
   - `"auto"` (fallback) → Simple Executor with smart pattern detection

### New Workflow Flow
```
Webhook → Validate → Load Site → Build Context → Prepare Fetch → Fetch Files
→ Merge Files → Fetch Memory → Check for Image → Merge Analysis → Cleanup Payload
→ Check Request Cache (fetches executor_mode from DB)
→ Input Router (routes based on executor_mode)
  ├─ Fast Mode → Simple Executor
  ├─ Thinking Mode → Complex Executor
  └─ Auto Mode (fallback) → Simple Executor
→ Merge Results → Parse Results → Save Memory → Git Push → Response
```

## Database Migration

The migration file [migrations/add_executor_mode_to_messages.sql](migrations/add_executor_mode_to_messages.sql) adds:
- `executor_mode` column to `messages` table
- Values: `'auto'`, `'fast'`, `'thinking'`
- Default: `'auto'`
- Index on `executor_mode` for fast filtering
- Check constraint to ensure valid values

### How to Apply Migration

**Option 1: Supabase Dashboard (Recommended)**
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `migrations/add_executor_mode_to_messages.sql`
4. Click "Run"

**Option 2: Using `psql` command line**
```bash
psql -h your-supabase-host -U postgres -d postgres -f migrations/add_executor_mode_to_messages.sql
```

**Option 3: Using Supabase CLI**
```bash
supabase db push
```

### Verify Migration
Run this query to check if the column exists:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'messages'
AND column_name = 'executor_mode';
```

Expected result:
```
 column_name   | data_type | column_default
---------------+-----------+----------------
 executor_mode | varchar   | 'auto'::varchar
```

## Frontend Integration

The frontend should send `executorMode` in the request body when calling the n8n webhook:

```typescript
// Example: When user selects mode from UI
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    siteId: 'your-site-id',
    conversationId: 'conv-123',
    message: 'change the title to "My App"',
    executorMode: 'fast' // or 'thinking' or 'auto'
  })
});
```

The `executorMode` value should also be saved to the `messages` table when creating a new message:

```sql
INSERT INTO messages (conversation_id, content, executor_mode)
VALUES ('conv-123', 'change the title to "My App"', 'fast');
```

## Testing

1. **Test Fast Mode**:
   - Select "Fast" mode in UI
   - Send message: "change the title to Test"
   - Should route to Simple Executor (Haiku)
   - Check n8n execution logs for: "⚡ FAST mode selected"

2. **Test Thinking Mode**:
   - Select "Thinking" mode in UI
   - Send message: "create a landing page"
   - Should route to Complex Executor (Sonnet)
   - Check n8n execution logs for: "🧠 THINKING mode selected"

3. **Test Auto Mode**:
   - Select "Auto" mode in UI
   - Send simple message: "change text to Hello"
   - Should auto-detect and route to Simple Executor
   - Check n8n execution logs for: "🤖 AUTO mode: Fast path detected"

## How to Deploy V42 Workflow

1. Open n8n dashboard
2. Navigate to your workflow
3. Click "Import from File"
4. Select `n8n/FIXED-AGENT-WORKFLOW-V42.json`
5. Review the changes (2 nodes removed, 1 node replaced)
6. Click "Save" to activate

## Benefits

✅ **Simpler**: 2 fewer nodes, less complexity
✅ **Faster**: Skips unnecessary classification logic
✅ **User Control**: Respects user's explicit mode selection
✅ **Predictable**: Direct routing based on database value
✅ **Maintainable**: Easier to debug and understand

## Rollback

If you need to rollback to V41:
```bash
# In n8n dashboard, import FIXED-AGENT-WORKFLOW-V41.json
```

The migration is safe to keep even if you rollback the workflow, as it just adds a column with a default value.
