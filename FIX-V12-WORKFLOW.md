# Fix for V12 Delimiter Workflow - Preview Not Updating

## Problem

The V12 Delimiter workflow uses **tool-based agents** which is much better than unified diffs! However, the tools are writing files **directly to GitHub** instead of to the **preview workspace**, so changes don't appear in the preview.

## Root Cause

1. `write_file` tool writes to GitHub (permanent) instead of preview workspace (temporary)
2. `str_replace_file` tool writes to GitHub instead of preview workspace
3. User sees old content because preview workspace hasn't been updated
4. Git pull happens at the end which might overwrite local changes

## Solution

Update the tool code in your n8n workflow to write to **preview workspace first**:

### Fix 1: Update `write_file` Tool

In your n8n workflow, click on the **write_file** tool node and replace the JavaScript code with:

```javascript
// Get raw input - format: filePath|||content
const rawInput = $fromAI('query', 'filePath|||content', 'string') || '';
const parts = rawInput.split('|||');

if (parts.length < 2) return 'Error: Use format filePath|||content';

const filePath = parts[0].trim().replace(/^\/+/, '');
const content = parts.slice(1).join('|||'); // In case content has |||

if (!filePath) return 'Error: filePath required';

const ctx = $('Merge Files')?.item?.json || {};
const siteId = ctx.site?.id;
if (!siteId) return 'Error: No site context';

try {
  // CRITICAL: Write to preview workspace first (this is what user sees)
  const previewResponse = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://preview-orchestrator.fly.dev/preview/write',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, filePath, content }),
    timeout: 15000
  });

  if (!previewResponse.ok) {
    return 'Error: Failed to write to preview: ' + (previewResponse.message || 'Unknown error');
  }

  // Success - file written to preview workspace
  return JSON.stringify({
    success: true,
    file: filePath,
    action: 'created_in_preview',
    message: 'File written to preview workspace'
  });

} catch (e) {
  return 'Error: ' + e.message;
}
```

### Fix 2: Update `str_replace_file` Tool

In your n8n workflow, click on the **str_replace_file** tool node and replace the JavaScript code with:

```javascript
// Get raw input - format: filePath|||search|||replace
const rawInput = $fromAI('query', 'filePath|||search|||replace', 'string') || '';
const parts = rawInput.split('|||');

if (parts.length < 3) return 'Error: Use format filePath|||searchText|||replaceText';

const filePath = parts[0].trim().replace(/^\/+/, '');
const search = parts[1];
const replace = parts.slice(2).join('|||'); // In case replace has |||

if (!filePath) return 'Error: filePath required';
if (!search) return 'Error: searchText required';

const ctx = $('Merge Files')?.item?.json || {};
const { owner, repo, branch } = ctx;
const siteId = ctx.site?.id;
if (!siteId) return 'Error: No site context';
if (!owner) return 'Error: No repository context';

try {
  // First, try to read from preview workspace
  let content;

  try {
    const workspaceResponse = await this.helpers.httpRequest({
      method: 'POST',
      url: 'https://preview-orchestrator.fly.dev/preview/read',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, filePath }),
      timeout: 10000
    });
    content = workspaceResponse.content;
  } catch {
    // File not in workspace yet, get from GitHub
    const response = await this.helpers.httpRequest({
      method: 'GET',
      url: `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`,
      headers: {
        'Authorization': 'Bearer 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',
        'Accept': 'application/vnd.github+json'
      },
      timeout: 15000
    });
    content = Buffer.from(response.content, 'base64').toString('utf8');
  }

  // Check if search exists
  if (!content.includes(search)) {
    const lines = content.split('\n');
    let hint = '';
    const searchLower = search.toLowerCase().substring(0, 20);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(searchLower)) {
        hint = ` Similar at line ${i+1}: "${lines[i].trim().substring(0, 50)}..."`;
        break;
      }
    }
    return 'Error: Search text not found. Must match EXACTLY (case-sensitive).' + hint;
  }

  // Replace
  const newContent = content.replace(search, replace);

  // Write to preview workspace
  const previewResponse = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://preview-orchestrator.fly.dev/preview/write',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, filePath, content: newContent }),
    timeout: 15000
  });

  if (!previewResponse.ok) {
    return 'Error: Failed to write to preview: ' + (previewResponse.message || 'Unknown error');
  }

  return JSON.stringify({
    success: true,
    file: filePath,
    action: 'updated_in_preview',
    message: 'File updated in preview workspace'
  });

} catch (e) {
  return e.message.includes('404') ? 'Error: File not found: ' + filePath : 'Error: ' + e.message;
}
```

### Fix 3: Remove or Update Git Pull Node

**Option A: Remove Git Pull** (Recommended)
- Delete the "Git Pull" node completely
- Connect "Parse Results" directly to "Save Request"
- Git pull is not needed because files are already in preview workspace

**Option B: Keep Git Pull** (If you want to sync with GitHub)
- Keep it, but be aware it might reset local changes
- Make sure it runs BEFORE the AI makes changes, not after

## How It Works After Fix

1. ✅ User sends message: "create header component"
2. ✅ AI uses `write_file` tool
3. ✅ File written to **preview workspace** at `/workspaces/00000000-.../src/components/Header.tsx`
4. ✅ Dev server detects file change and rebuilds
5. ✅ **Preview shows new component immediately**
6. ✅ Changes saved to database
7. ✅ User clicks "Accept Changes" → commits to GitHub

## Testing After Fix

1. **Stop any running preview:**
   ```bash
   curl -X POST https://preview-orchestrator.fly.dev/preview/stop \
     -H "Content-Type: application/json" \
     -d '{"siteId":"00000000-0000-0000-0000-000000000001"}'
   ```

2. **Start fresh preview in your app**

3. **Send test message:**
   ```
   create a header component with shop name "Test Shop"
   ```

4. **Verify:**
   - ✅ AI creates file
   - ✅ Wait 3 seconds
   - ✅ Preview refreshes automatically
   - ✅ Header appears with "Test Shop"

5. **Test modification:**
   ```
   change "Test Shop" to "My Store"
   ```

6. **Verify:**
   - ✅ AI modifies file
   - ✅ Preview updates
   - ✅ Shows "My Store"

## Files Modified

1. ✅ **fly-orchestrator/src/index.ts** - Added `/preview/write`, `/preview/read`, `/preview/pull` endpoints
2. ✅ **Deployed to Fly.io** (2025-12-24)
3. ⚠️ **n8n workflow** - Update `write_file` and `str_replace_file` tools (YOU NEED TO DO THIS)

## Why This is Better Than Unified Diffs

✅ **Simpler** - Direct file writes instead of complex diff parsing
✅ **More reliable** - No JSON truncation issues
✅ **Better for AI** - AI can see exact tool results
✅ **Easier to debug** - Clear tool calls and responses
✅ **Supports file creation** - Can create new files easily
✅ **More flexible** - Can delete, search, replace, etc.

## Common Issues After Fix

### Preview still not updating?

1. **Check orchestrator deployed correctly:**
   ```bash
   curl https://preview-orchestrator.fly.dev/health
   ```
   Should show `"ok": true`

2. **Check preview is running:**
   ```bash
   curl -X POST https://preview-orchestrator.fly.dev/preview/status \
     -H "Content-Type: application/json" \
     -d '{"siteId":"00000000-0000-0000-0000-000000000001"}'
   ```
   Should show `"status": "running"`

3. **Check tool is writing files:**
   - Look at n8n workflow execution
   - Check tool response shows `success: true`
   - Check orchestrator logs: `flyctl logs -a preview-orchestrator`

### Files are created but preview shows old content?

- Wait the full 3 seconds for dev server rebuild
- Hard refresh browser: Cmd+Shift+R
- Check dev server is running in orchestrator logs

### AI says "Error: Preview not running"?

- Start the preview first by clicking "Show Preview" button
- Or manually start:
  ```bash
  curl -X POST https://preview-orchestrator.fly.dev/preview/start \
    -H "Content-Type: application/json" \
    -d '{"siteId":"00000000-0000-0000-0000-000000000001","repoUrl":"https://github.com/OhoBEiD/ai-demo-shop.git","branch":"main"}'
  ```

## Summary

The V12 Delimiter workflow is **much better** than the old unified diff approach, but needs small fixes to write to preview workspace instead of GitHub directly. After fixing:

- ✅ AI creates files in preview
- ✅ AI modifies files in preview
- ✅ Changes appear immediately
- ✅ Changes persist between edits
- ✅ User can accept to commit to GitHub

This is the **ideal workflow** for the AI editor!
