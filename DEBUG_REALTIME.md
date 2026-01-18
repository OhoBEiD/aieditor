# Debug Realtime Thinking Steps

## Steps to Enable & Test

### 1. Enable Realtime in Supabase

Run the SQL in `ENABLE_REALTIME.sql` in your Supabase SQL Editor.

### 2. Test in Browser Console

When you send a message, open browser DevTools console and look for:

```
🔌 Subscribing to thinking steps for request: req_1234567890_abc123
📡 Subscription status: SUBSCRIBED
📝 New thinking step: {step_number: 1, message: "Analyzing...", ...}
```

### 3. Check Supabase Dashboard

Go to: **Database** → **Replication** → Verify `thinking_steps` is listed

### 4. Verify Thinking Steps are Being Inserted

Open Supabase **Table Editor** → `thinking_steps` table

Send a test message and watch for new rows appearing in real-time.

### 5. Common Issues

#### ❌ Not seeing "Subscribing" message
**Problem:** `currentRequestId` is not being set

**Fix:** Check that line 914 in `page.tsx` is executing:
```typescript
setCurrentRequestId(requestId); // This should run when sending message
```

#### ❌ Subscription status is "CHANNEL_ERROR" or "TIMED_OUT"
**Problem:** Realtime not enabled on table

**Fix:** Run `ENABLE_REALTIME.sql`

#### ❌ Seeing subscription but no steps
**Problem:** n8n isn't writing to `thinking_steps` table

**Fix:** Check n8n workflow is actually inserting rows. Look at these nodes:
- "Fetch Memory" node inserts step_number=1
- "Parse Plan" node inserts step_number=2
- Tools insert various steps
- "Parse Results" node inserts step_number=999999 (complete)

#### ❌ Steps appear in DB but not in UI
**Problem:** RLS policy blocking reads

**Fix:** Make sure you ran the policy in `ENABLE_REALTIME.sql`:
```sql
CREATE POLICY "Allow public read access to thinking steps"
  ON thinking_steps FOR SELECT USING (true);
```

### 6. Manual Test

You can manually test by inserting a row:

```sql
INSERT INTO thinking_steps (
  request_id,
  site_id,
  step_number,
  tool_name,
  status,
  message,
  details
) VALUES (
  'test_request_123',
  'test_site',
  1,
  'test_tool',
  'running',
  'This is a test step',
  '{}'::jsonb
);
```

Then in your React app:
```typescript
setCurrentRequestId('test_request_123');
```

You should see the step appear!

## Expected Flow

1. User sends message: "change omar obeid to omar ai services"
2. App generates `requestId` like `req_1704567890_abc123`
3. App calls `setCurrentRequestId(requestId)`
4. `useThinkingSteps` hook subscribes to Supabase realtime
5. n8n workflow starts executing
6. n8n inserts rows into `thinking_steps` table:
   - Step 1: "Analyzing..."
   - Step 2: "Complex task - routing to advanced model" or "Simple task"
   - Step 3+: Various tool executions (str_replace, write_file, etc.)
   - Step 999999: "Request completed"
7. Supabase broadcasts each INSERT to subscribed clients
8. React app receives updates via `useThinkingSteps` hook
9. `ChatPanel` shows `ThinkingSteps` component with live updates

## Quick Check

Open browser console and run:

```javascript
// Check if subscription exists
console.log(window.supabase.getChannels());

// Should show: Array with channel named "thinking-steps-req_..."
```
