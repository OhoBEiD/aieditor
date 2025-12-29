# Complete Fix Instructions for n8n AI Agent Workflow

## Problem Summary

The AI agent is generating correct diffs, but they're not being applied because:

1. ❌ AI outputs explanatory text before JSON (LangChain agent behavior)
2. ❌ Old Parse Plan code can't extract JSON from mixed text
3. ❌ Old workflow had non-existent "Refresh Preview" endpoint

## Solution: Update Your n8n Workflow

### Step 1: Update Parse Plan Node

Replace the JavaScript code in your **Parse Plan** node with the improved version from:
`n8n/IMPROVED-PARSE-PLAN.js`

**How to do this:**
1. Open your n8n workflow
2. Click on the "Parse Plan" node
3. Delete all the code
4. Copy the entire contents of `IMPROVED-PARSE-PLAN.js`
5. Paste it into the Parse Plan node
6. Save

### Step 2: Remove Broken Nodes

Delete these nodes from your workflow:
- ❌ **Refresh Preview** node (calls non-existent `/preview/refresh` endpoint)
- ❌ **Merge Refresh** node (no longer needed)

### Step 3: Fix Connections

After deleting those nodes, reconnect:
```
Merge Apply → Save Request → Response
```

The connections should be:
1. Guardrails → Fly Apply Diff
2. Fly Apply Diff → Merge Apply
3. Merge Apply → Save Request  ← **FIX THIS CONNECTION**
4. Save Request → Response

### Step 4: Update Response Node

Change the Response node's `responseBody` to reference `Merge Apply` instead of `Merge Refresh`:

**Old (wrong):**
```javascript
$('Merge Refresh').item.json.requestId
```

**New (correct):**
```javascript
$('Merge Apply').item.json.requestId
```

Full correct Response body:
```javascript
{{ JSON.stringify({
  requestId: $('Merge Apply').item.json.requestId,
  status: 'preview_ready',
  summary: $('Merge Apply').item.json.plan.humanSummary || '',
  diff: $('Merge Apply').item.json.plan.unifiedDiff || '',
  previewUrl: $('Merge Apply').item.json.previewUrl || '',
  filesChanged: $('Merge Apply').item.json.filesChanged || [],
  warnings: $('Merge Apply').item.json.plan.warnings || []
}) }}
```

## Quick Fix: Import the Fixed Workflow

Alternatively, you can import the complete fixed workflow:

1. Go to your n8n workflows page
2. Click "Import from File"
3. Select `n8n/FIXED-WORKFLOW.json`
4. Activate the workflow

## Why This Fixes the Issue

### Improved Parse Plan Code

The new Parse Plan code:
- ✅ Extracts JSON from markdown code blocks (` ```json`)
- ✅ Uses brace counting to find complete JSON objects
- ✅ Has 3 fallback regex patterns
- ✅ Handles AI text like "Perfect! I found..."
- ✅ Cleans up JSON before parsing (removes control chars, trailing commas)

### Removed Non-Existent Endpoint

The old workflow called `/preview/refresh` which doesn't exist in your fly-orchestrator. The `/preview/apply` endpoint already restarts the dev server automatically when needed (lines 403-409 in `fly-orchestrator/src/index.ts`).

## Expected Behavior After Fix

When you send "change modern shop title to omar shop":

1. ✅ AI generates unified diffs
2. ✅ Parse Plan extracts JSON (even with text around it)
3. ✅ Fly Apply Diff applies changes to workspace files
4. ✅ Dev server automatically restarts
5. ✅ Preview updates with new "Omar Shop" title
6. ✅ Changes saved to database
7. ✅ Success response returned

## Testing

After applying the fix:

1. Send message: "change modern shop title to omar shop"
2. Wait for response
3. Check preview - should show "OmarShop" instead of "ModernShop"
4. Verify in GitHub repo - files should be changed

## Troubleshooting

### If Parse Plan still fails:
- Check that you copied the COMPLETE code from `IMPROVED-PARSE-PLAN.js`
- Verify there are no syntax errors in the JavaScript

### If preview doesn't update:
- Check fly-orchestrator logs for errors
- Verify the workspace exists at `/workspaces/00000000-0000-0000-0000-000000000001`
- Check that dev server is running

### If changes aren't in GitHub:
- This is normal! Changes are only in the workspace (preview)
- They won't be in GitHub until you click "Accept Changes" and deploy

## Files Modified

- ✅ `n8n/IMPROVED-PARSE-PLAN.js` - Robust JSON extraction
- ✅ `n8n/IMPROVED-SYSTEM-PROMPT.txt` - Better AI instructions
- ✅ `n8n/FIXED-WORKFLOW.json` - Complete working workflow

## Summary of Changes

| Component | Old Behavior | New Behavior |
|-----------|-------------|--------------|
| Parse Plan | Fails on mixed text/JSON | Extracts JSON from any format |
| Workflow | Calls `/preview/refresh` | Skips refresh (not needed) |
| Response | References `Merge Refresh` | References `Merge Apply` |
| AI Output | Tries to output pure JSON | Mixed text + JSON (handled by Parse Plan) |

## Next Steps

1. Update Parse Plan code
2. Remove Refresh Preview & Merge Refresh nodes
3. Fix connections
4. Test with "change modern shop to omar shop"
5. Verify preview updates correctly

Your workflow will then work perfectly! 🎉
