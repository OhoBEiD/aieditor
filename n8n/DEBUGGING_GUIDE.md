# Debugging Guide: Why Changes Aren't Applying

## ✅ What We Know Works
- ✅ Fly.io Apply Diff endpoint is working (tested with `test-apply.js`)
- ✅ AI understands your requests correctly
- ✅ n8n workflow is calling the endpoint

## ❓ What to Check

### 1. Check if the AI is generating a diff

In your n8n workflow execution (the screenshot you showed):

1. **Expand the `plan_json` object** in the left panel
2. Look for `unifiedDiff` field
3. **If it's empty or missing** → AI isn't generating diffs (need to update prompt)
4. **If it exists** → Copy it and paste it below to verify format

### 2. Check the diff format

A valid diff should look like this:
```
--- a/src/app/page.tsx
+++ b/src/app/page.tsx
@@ -10,7 +10,7 @@
         <div className="container">
-          <h1>Demo Site</h1>
+          <h1>Obeid Store</h1>
           <p>Description</p>
```

**Red flags:**
- ❌ No `---` or `+++` headers
- ❌ No `@@` hunk markers
- ❌ File path doesn't match actual file
- ❌ Context lines don't match file content

### 3. Add Debug Node (Recommended)

Add the code from `debug-diff-output.js` as a Code node AFTER "Parse Plan":

1. In n8n, click **+** between "Parse Plan" and "Guardrails"
2. Add a **Code** node
3. Paste the contents of `debug-diff-output.js`
4. Save and test

This will log:
- The full unified diff
- Warnings if diff is malformed
- File targets

### 4. Check Fly Apply Diff Response

In your screenshot, look at the "Merge Apply" node output:
- `filesChanged` - should show which files were modified
- `applyOk` - should be `true`
- If `applyOk` is `false`, check `warnings` array

### 5. Update the AI Prompt

Replace your AI Plan system message with the content from `improved-system-prompt.txt`. This:
- Emphasizes making **visible** changes
- Provides clear diff format examples
- Tells AI to change `<h1>` text, not `<title>` metadata

## 🔧 Quick Fixes

### Fix #1: Empty conversations table
This is normal if you just started. When you send a message, a session will be auto-created.

### Fix #2: NULL session_id/message_id in Response
This is **NORMAL** - the n8n workflow doesn't create messages. Your frontend does that after receiving the response.

### Fix #3: Changes not appearing
Most likely cause: AI isn't generating valid unified diffs OR is changing metadata instead of visible content.

**Solution:**
1. Update the AI system prompt with the improved version
2. Be more specific in your requests: "change the main heading text to X" instead of "change the title to X"
3. Add debug node to see what diffs are being generated

## 🎯 Next Steps

1. **Check the `plan_json.unifiedDiff` in your n8n execution** (expand it in the left panel)
2. **If empty** → Update AI prompt and test again
3. **If exists but malformed** → Share it with me so I can help fix the format
4. **If valid** → Check the Fly Apply Diff response for errors

Let me know what you find!
