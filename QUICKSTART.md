# 🚀 Quick Start - Enable Live Thinking Steps

## Your frontend is ready! Just enable Supabase Realtime:

### 1. Open Supabase SQL Editor
Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql

### 2. Run This SQL:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE thinking_steps;
ALTER TABLE thinking_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access to thinking steps"
  ON thinking_steps FOR SELECT USING (true);
```

### 3. Done! ✅

Test by sending a message. You should see live steps instead of "Agent thinking...".

---

## Optional: Import Latest Workflow

If you want the V16 fixes (smart search_files, working tools, etc.):

1. Go to n8n: https://n8n-ai-editor.fly.dev
2. Import: `/Users/omarobeid/Desktop/aieditor/n8n/FIXED-AGENT-WORKFLOW-V16.json`
3. Activate the workflow

---

## Troubleshooting

If steps don't appear, check browser console for:
- `🔌 Subscribing to thinking steps for request: req_xxx`
- `📡 Subscription status: SUBSCRIBED`

If you don't see these, see `DEBUG_REALTIME.md`
