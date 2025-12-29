# Thinking Steps Fix - Complete Guide

## Problem Fixed ✅

The AI thinking steps weren't showing because the frontend and n8n workflow were using **different `requestId` values**.

### Root Cause

1. Frontend generates `requestId`: `req_1735483200000_abc123`
2. Frontend sends to `/api/chat` with this `requestId`
3. API route **ignored** the frontend's `requestId` and generated a new one: `req_1735483201000_xyz789`
4. API sends the new `requestId` to n8n
5. n8n writes thinking steps to Supabase with: `req_1735483201000_xyz789`
6. Frontend subscribes to thinking steps with: `req_1735483200000_abc123` ❌
7. **They don't match!** No thinking steps appear.

### Solution Applied

Updated [src/app/api/chat/route.ts](src/app/api/chat/route.ts#L9-L20):

```typescript
// BEFORE (Wrong):
const { siteId, conversationId, userId, message, pageUrl, uiContext, image } = body;
const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`; // ❌ Generates new ID

// AFTER (Fixed):
const { siteId, conversationId, userId, message, pageUrl, uiContext, image, requestId: clientRequestId } = body;
const requestId = clientRequestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`; // ✅ Uses client's ID
```

Now the **same `requestId`** flows through:
- Frontend → API → n8n → Supabase → Frontend subscription ✅

---

## What Still Needs to Be Done

The thinking steps infrastructure is set up, but you need to verify the n8n workflow is configured correctly:

### 1. Verify Supabase Table Exists

Run this SQL in your Supabase SQL Editor (if not already done):

```sql
-- Check if table exists
SELECT * FROM thinking_steps LIMIT 1;
```

If you get an error, run the full schema from [supabase/thinking_steps.sql](supabase/thinking_steps.sql).

### 2. Verify Realtime is Enabled

1. Go to **Supabase Dashboard → Database → Replication**
2. Find `thinking_steps` table
3. Make sure the toggle is **ON** for Realtime

### 3. Update n8n Workflow

The n8n workflow needs to write thinking steps to Supabase. Two options:

#### Option A: Import Latest Workflow (Recommended)

1. Go to n8n dashboard: `https://n8n-ai-editor.fly.dev`
2. Import the workflow: `n8n/AI-EDITOR-V14-LIVE-THINKING.json`
3. Activate it
4. Make it the active webhook endpoint

#### Option B: Manual Update (Advanced)

If you want to keep your current workflow, manually update the tool nodes (write_file, str_replace_file, etc.) to write thinking steps.

See the guide: [LIVE-THINKING-SETUP-GUIDE.md](LIVE-THINKING-SETUP-GUIDE.md#22-update-write_file-tool-node)

### 4. Add Supabase Credentials to n8n

Your n8n workflow needs Supabase credentials to write thinking steps.

#### Method 1: Environment Variables (Recommended)

SSH into your n8n Fly.io app and set:

```bash
fly ssh console -a n8n-ai-editor

# Set environment variables
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=your-anon-key-here
```

Then restart the app:
```bash
fly apps restart n8n-ai-editor
```

#### Method 2: Hardcode in Workflow (Quick Test)

Edit the tool nodes in n8n and replace:

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

With your actual values:

```javascript
const SUPABASE_URL = 'https://xxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

You can find these in:
- Supabase Dashboard → Settings → API
- `SUPABASE_URL` = Project URL
- `SUPABASE_ANON_KEY` = anon/public key

---

## Testing

### 1. Test Frontend Subscription (Already Working ✅)

Open browser console and send a message. You should see:

```
Thinking steps subscription status: SUBSCRIBED
```

This confirms the frontend is ready to receive thinking steps.

### 2. Test n8n Writing to Supabase

After updating the workflow, send a message like:

```
create a new file called test.txt with content "hello world"
```

Then check Supabase:

```sql
SELECT * FROM thinking_steps ORDER BY created_at DESC LIMIT 10;
```

You should see rows like:

| request_id | tool_name | status | message |
|------------|-----------|--------|---------|
| req_... | write_file | running | Creating file: test.txt |
| req_... | write_file | complete | ✓ Created test.txt |

### 3. Test End-to-End

1. Open the app in browser
2. Open browser console
3. Send a message: "create a header component"
4. You should see **live thinking steps** appear in the UI:
   ```
   🧠 Agent Working... (2 steps)

   🔵 Creating file: src/components/Header.tsx...
   ✅ ✓ Created src/components/Header.tsx
   ```

---

## Troubleshooting

### Issue: Console says "SUBSCRIBED" but no steps appear

**Cause**: n8n is not writing thinking steps to Supabase

**Fix**:
1. Verify n8n has Supabase credentials (Step 4 above)
2. Check n8n execution logs to see if HTTP requests to Supabase are being made
3. Verify the workflow has the thinking step code (use AI-EDITOR-V14-LIVE-THINKING.json)

### Issue: Steps appear but are delayed by 10+ seconds

**Cause**: n8n might be writing thinking steps after the tool completes instead of during

**Fix**: Verify the tool nodes call `writeThinkingStep()` with status `'running'` **before** executing the tool, not after

### Issue: "Error: relation 'thinking_steps' does not exist"

**Cause**: The Supabase table hasn't been created

**Fix**: Run the SQL schema from [supabase/thinking_steps.sql](supabase/thinking_steps.sql)

### Issue: Frontend shows old thinking steps from previous requests

**Cause**: `setCurrentRequestId(null)` not being called after completion

**Fix**: Already handled in [page.tsx:709](src/app/page.tsx#L709) - clears after 3 seconds

---

## Quick Checklist

- [x] **Frontend generates `requestId`** - ✅ Done in page.tsx:648
- [x] **API forwards `requestId` to n8n** - ✅ Fixed in route.ts:9-20
- [x] **Frontend subscribes to thinking steps** - ✅ Done via useThinkingSteps hook
- [ ] **Supabase table created** - Verify with `SELECT * FROM thinking_steps`
- [ ] **Realtime enabled** - Check Supabase Dashboard → Replication
- [ ] **n8n workflow updated** - Import AI-EDITOR-V14-LIVE-THINKING.json
- [ ] **n8n has Supabase credentials** - Set SUPABASE_URL and SUPABASE_ANON_KEY

---

## Next Steps

1. **Verify Supabase table exists and has Realtime enabled**
2. **Import AI-EDITOR-V14-LIVE-THINKING.json to n8n** (or manually update tool nodes)
3. **Add Supabase credentials to n8n environment**
4. **Test by sending a message** and watching for live thinking steps

Once n8n is configured to write thinking steps, they will automatically appear in the UI in real-time! 🎉

---

## Files Changed

- [src/app/api/chat/route.ts](src/app/api/chat/route.ts) - Fixed to use client's `requestId`

## Related Documentation

- [LIVE-THINKING-SETUP-GUIDE.md](LIVE-THINKING-SETUP-GUIDE.md) - Complete setup guide
- [supabase/thinking_steps.sql](supabase/thinking_steps.sql) - Database schema
- [n8n/AI-EDITOR-V14-LIVE-THINKING.json](n8n/AI-EDITOR-V14-LIVE-THINKING.json) - Latest workflow with thinking steps
