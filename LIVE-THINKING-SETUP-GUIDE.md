# Live Thinking Steps - Complete Setup Guide

This guide shows you how to implement **live AI agent thinking updates** in your AI Editor using Supabase Realtime. Users will see exactly what the AI agent is doing in real-time as it works.

## 🎯 What You'll Get

- ✅ Real-time updates showing what tools the AI is using (write_file, str_replace_file, etc.)
- ✅ Live status updates (pending → running → complete/error)
- ✅ Expandable details for each step
- ✅ Beautiful UI with animations and progress indicators
- ✅ No polling - instant updates via Supabase Realtime

## 📋 Prerequisites

- Supabase project with Realtime enabled
- n8n workflow (AI-EDITOR-V12-DELIMITER.json)
- Next.js frontend already set up

---

## Step 1: Set Up Supabase Database

### 1.1 Run SQL Schema

Open your Supabase SQL Editor and run:

```sql
-- File: supabase/thinking_steps.sql

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
```

### 1.2 Verify Realtime is Enabled

1. Go to **Database → Replication** in Supabase Dashboard
2. Find `thinking_steps` table
3. Make sure it's enabled for Realtime

---

## Step 2: Update Your n8n Workflow

You need to update your tool nodes to write thinking steps to Supabase.

### 2.1 Update Environment Variables in n8n

Add these to your n8n workflow's environment or credential store:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### 2.2 Update `write_file` Tool Node

Find the `write_file` tool node in your **AI-EDITOR-V12-DELIMITER** workflow and replace its code with:

```javascript
// File: n8n/UPDATED-TOOL-write-file-with-thinking.js

// Configuration
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Get raw input - format: filePath|||content
const rawInput = $fromAI('query', 'filePath|||content', 'string') || '';
const parts = rawInput.split('|||');

if (parts.length < 2) return 'Error: Use format filePath|||content';

const filePath = parts[0].trim().replace(/^\\/+/, '');
const content = parts.slice(1).join('|||');

if (!filePath) return 'Error: filePath required';

const ctx = $('Merge Files')?.item?.json || {};
const siteId = ctx.site?.id;
const requestId = ctx.requestId;
const conversationId = ctx.conversationId;

if (!siteId) return 'Error: No site context';

// Helper function to write thinking step
async function writeThinkingStep(stepData) {
  try {
    await this.helpers.httpRequest({
      method: 'POST',
      url: `${SUPABASE_URL}/rest/v1/thinking_steps`,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        request_id: requestId,
        conversation_id: conversationId,
        site_id: siteId,
        ...stepData
      }),
      timeout: 3000
    });
  } catch (e) {
    console.error('Failed to write thinking step:', e.message);
  }
}

try {
  // STEP 1: Report that we're starting
  await writeThinkingStep.call(this, {
    step_number: Date.now(),
    tool_name: 'write_file',
    status: 'running',
    message: `Creating file: ${filePath}`,
    details: { filePath, contentLength: content.length }
  });

  // STEP 2: Write to preview workspace
  const previewResponse = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://preview-orchestrator.fly.dev/preview/write',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, filePath, content }),
    timeout: 15000
  });

  if (!previewResponse.ok) {
    await writeThinkingStep.call(this, {
      step_number: Date.now(),
      tool_name: 'write_file',
      status: 'error',
      message: `Failed to create ${filePath}`,
      details: { filePath, error: previewResponse.message }
    });
    return 'Error: Failed to write to preview: ' + (previewResponse.message || 'Unknown error');
  }

  // STEP 3: Report success
  await writeThinkingStep.call(this, {
    step_number: Date.now(),
    tool_name: 'write_file',
    status: 'complete',
    message: `✓ Created ${filePath}`,
    details: { filePath, contentLength: content.length }
  });

  return JSON.stringify({
    success: true,
    file: filePath,
    action: 'created_in_preview',
    message: 'File written to preview workspace'
  });

} catch (e) {
  await writeThinkingStep.call(this, {
    step_number: Date.now(),
    tool_name: 'write_file',
    status: 'error',
    message: `Error creating ${filePath}: ${e.message}`,
    details: { filePath, error: e.message }
  });
  return 'Error: ' + e.message;
}
```

### 2.3 Update `str_replace_file` Tool Node

Find the `str_replace_file` tool node and replace its code with the file at:
`n8n/UPDATED-TOOL-str-replace-with-thinking.js`

### 2.4 Update Other Tool Nodes (Optional)

You can apply the same pattern to other tools (`read_file`, `list_files`, etc.):

1. Add the `writeThinkingStep` helper function
2. Call it before the tool executes (status: 'running')
3. Call it after success (status: 'complete') or error (status: 'error')

---

## Step 3: Verify Frontend Integration

The frontend code has already been updated! Here's what was done:

### 3.1 New Hook: `useThinkingSteps`

Located at: `src/hooks/useThinkingSteps.ts`

This hook:
- Subscribes to Supabase Realtime for a specific `requestId`
- Fetches existing steps on mount
- Updates in real-time as new steps are inserted
- Auto-cleans up subscription when done

### 3.2 Updated Component: `ThinkingSteps`

Located at: `src/components/chat/ThinkingSteps.tsx`

Now supports both formats:
- Old format: `{ text, status, toolName }`
- New format: `{ message, status, tool_name, details }` (from Supabase)

### 3.3 Updated Page: `src/app/page.tsx`

Changes:
- Generates `requestId` for each message
- Passes `requestId` to `/api/chat` endpoint
- Uses `useThinkingSteps(requestId)` hook for live updates
- Passes `liveThinkingSteps` to ChatPanel

---

## Step 4: Update API Route (Optional)

If your `/api/chat/route.ts` doesn't already pass `requestId` to n8n, update it:

```typescript
// src/app/api/chat/route.ts
const response = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        siteId,
        conversationId,
        userId,
        message,
        pageUrl,
        uiContext,
        requestId,  // ← ADD THIS
        image,
    }),
});
```

---

## Step 5: Testing

### 5.1 Test Database Schema

```sql
-- Insert a test thinking step
INSERT INTO thinking_steps (request_id, site_id, step_number, tool_name, status, message, details)
VALUES ('test_123', '00000000-0000-0000-0000-000000000001', 1, 'write_file', 'complete', 'Test step', '{"test": true}');

-- Query it back
SELECT * FROM thinking_steps WHERE request_id = 'test_123';

-- Delete test data
DELETE FROM thinking_steps WHERE request_id = 'test_123';
```

### 5.2 Test Realtime Subscription

1. Open your app in browser
2. Open browser console
3. Send a message to AI
4. You should see console logs:
   - "Thinking steps subscription status: SUBSCRIBED"
   - "New thinking step: { ... }"

### 5.3 Test Full Workflow

1. **Start Preview**: Click "Show Preview" button
2. **Send Message**: "create a header component"
3. **Watch Live Updates**: You should see:
   - `Creating file: src/components/Header.tsx` (status: running)
   - `✓ Created src/components/Header.tsx` (status: complete)
4. **Verify Preview**: File should appear in preview after 3 seconds

### 5.4 Test Error Handling

Send a message that will cause an error:

```
modify the file doesnt-exist.tsx
```

You should see:
- `Reading doesnt-exist.tsx...` (status: running)
- `Error: File not found: doesnt-exist.tsx` (status: error)

---

## 🎨 UI Features

The ThinkingSteps component provides:

### Collapsed View (Default)
- Shows agent status (Working / Complete)
- Shows current step with spinner
- Shows total number of steps
- "Show details" toggle

### Expanded View
- All steps with status icons (spinner/check/error)
- Tool name badges (write_file, read_file, etc.)
- Expandable details for each step
- Syntax highlighting for JSON details

### Status Icons
- 🔵 **Pending/Running**: Animated spinner
- ✅ **Complete**: Green checkmark
- ❌ **Error**: Red error icon

---

## 📊 Monitoring & Debugging

### Check Supabase Logs

1. Go to **Logs → Realtime** in Supabase Dashboard
2. Look for connection events from your frontend
3. Verify messages are being broadcast

### Check n8n Execution Logs

1. Open n8n workflow executions
2. Look at each tool node output
3. Verify thinking steps are being written (you'll see HTTP requests to Supabase)

### Check Frontend Console

Look for:
```
Thinking steps subscription status: SUBSCRIBED
New thinking step: { id: '...', message: 'Creating file...', status: 'running' }
```

### Common Issues

**Issue**: Steps not appearing in real-time
- **Fix**: Check Realtime is enabled for `thinking_steps` table in Supabase
- **Fix**: Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` in n8n

**Issue**: Steps appear but with delay
- **Expected**: Slight delay (100-500ms) is normal for Realtime
- **Fix**: If delay > 2 seconds, check your network/Supabase region

**Issue**: Steps persist across requests
- **Fix**: Ensure `setCurrentRequestId(null)` is called after completion
- **Fix**: Check cleanup timeout (3 seconds) in `handleSendMessage`

---

## 🚀 Deployment Checklist

- [ ] SQL schema created in Supabase production database
- [ ] Realtime enabled for `thinking_steps` table
- [ ] n8n workflow updated with thinking step writes
- [ ] Environment variables set in n8n (SUPABASE_URL, SUPABASE_ANON_KEY)
- [ ] Frontend deployed with updated code
- [ ] Test end-to-end with real AI requests
- [ ] Verify RLS policies match your auth requirements
- [ ] Set up cleanup job for old thinking steps (optional)

---

## 🎉 Example Output

When working, users will see:

```
🧠 Agent Working... (3 steps)

  🔵 Reading src/app/page.tsx...
  ✅ Modified src/app/page.tsx
  🔵 Creating src/components/NewFeature.tsx...
```

Click "Show details" to expand:

```
🧠 Task Complete (3 steps)

  ✅ read_file | Reading src/app/page.tsx...
      {
        "filePath": "src/app/page.tsx",
        "action": "read"
      }

  ✅ str_replace_file | Modified src/app/page.tsx
      {
        "filePath": "src/app/page.tsx",
        "changes": 1
      }

  ✅ write_file | Created src/components/NewFeature.tsx
      {
        "filePath": "src/components/NewFeature.tsx",
        "contentLength": 1234
      }
```

---

## 📝 Summary

You now have:

1. ✅ **Database**: `thinking_steps` table with Realtime enabled
2. ✅ **n8n Tools**: Updated to report progress to Supabase
3. ✅ **Frontend Hook**: `useThinkingSteps` for live subscriptions
4. ✅ **UI Component**: Beautiful live thinking display
5. ✅ **Integration**: All wired up in page.tsx

Users can now see **exactly what the AI agent is doing** as it works, making the experience feel more transparent and responsive!

---

## 🔗 Files Reference

Created/Updated:
- `supabase/thinking_steps.sql` - Database schema
- `n8n/UPDATED-TOOL-write-file-with-thinking.js` - Updated write_file tool
- `n8n/UPDATED-TOOL-str-replace-with-thinking.js` - Updated str_replace_file tool
- `src/hooks/useThinkingSteps.ts` - Realtime subscription hook
- `src/components/chat/ThinkingSteps.tsx` - Updated UI component
- `src/app/page.tsx` - Integration with live thinking

Need Help?
- Check Supabase Realtime docs: https://supabase.com/docs/guides/realtime
- Review n8n HTTP Request node docs for debugging
- Test Realtime connection with Supabase's built-in test tool
