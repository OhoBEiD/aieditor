# Preview Refresh Fix - Changes Not Showing

## Problem

The n8n AI agent workflow was successfully applying file changes to the workspace, but the preview iframe wasn't showing the updated content. Users would see the old content even after the AI confirmed changes were applied.

**Workflow Status:**
- ✅ Parse Plan: Extracting JSON correctly
- ✅ Fly Apply Diff: Applying changes to files
- ✅ Files Changed: src/app/layout.tsx, src/components/Header.tsx
- ❌ Preview: Not showing the changes

## Root Causes

The issue had THREE parts that all needed to be fixed:

### 1. Workspace Changes Being Wiped Out (CRITICAL)
**The biggest issue:** Every time `/preview/start` was called, the orchestrator would run:
```bash
git reset --hard origin/main
```

This would **wipe out all uncommitted changes** from previous edits, even though they were successfully applied!

**Timeline:**
1. AI applies changes to workspace files (t=0s)
2. Changes are in workspace successfully
3. User sends another message or preview restarts
4. `/preview/start` calls `git reset --hard` ❌
5. **All changes are deleted!**
6. Preview shows original content from GitHub

### 2. Immediate Refresh Before Dev Server Rebuild
The frontend was trying to refresh the preview iframe immediately after receiving the response from n8n, but the Next.js dev server needs 2-3 seconds to rebuild after file changes are detected.

**Timeline:**
1. AI applies changes to workspace files (t=0s)
2. Frontend receives response and tries to refresh iframe (t=0.1s)
3. Iframe loads - but dev server is still rebuilding (t=0.2s)
4. Dev server finishes rebuild with new changes (t=2-3s)
5. User sees old content because iframe already loaded before rebuild finished

### 2. Preview URL Not Triggering Re-render
The `previewUrl` returned from n8n was the same base URL every time:
```
https://preview-00000000-0000-0000-0000-000000000001.fly.dev
```

React wouldn't trigger a re-render because the URL string was identical, even though the content at that URL had changed.

## Solutions

### Fix 1: Preserve Workspace Changes (CRITICAL)

**File:** `fly-orchestrator/src/index.ts` (lines 156-191)

**Before:**
```typescript
if (isValidRepo) {
    console.log(`Workspace exists for ${siteId}, fetching updates...`);
    execSync(`git fetch origin && git reset --hard origin/${branch}`, {
        cwd: workspacePath,
        stdio: 'pipe'
    });
}
```

**After:**
```typescript
if (isValidRepo) {
    console.log(`Workspace exists for ${siteId}, checking for local changes...`);
    // Check if there are uncommitted changes
    const statusResult = execSync('git status --porcelain', {
        cwd: workspacePath,
        stdio: 'pipe',
        encoding: 'utf-8'
    });

    const hasChanges = statusResult.trim().length > 0;

    if (hasChanges) {
        console.log(`Workspace has uncommitted changes for ${siteId}, preserving them...`);
        // Don't reset - preserve local changes from previous edits
        execSync('git fetch origin', { cwd: workspacePath, stdio: 'pipe' });
    } else {
        console.log(`No local changes for ${siteId}, fetching and resetting...`);
        // No local changes, safe to reset
        execSync(`git fetch origin && git reset --hard origin/${branch}`, {
            cwd: workspacePath,
            stdio: 'pipe'
        });
    }
}
```

**What this does:**
- Checks for uncommitted changes using `git status --porcelain`
- If changes exist (from previous AI edits), preserves them
- Only resets to remote if workspace is clean
- Ensures changes survive across preview restarts

### Fix 2: Wait for Dev Server Rebuild

**File:** `src/app/page.tsx` (lines 558-572)

**Before:**
```typescript
// Update preview and force reload by adding timestamp
if (result.previewUrl) {
    const baseUrl = result.previewUrl.split('?')[0].split('#')[0];
    const urlWithTimestamp = `${baseUrl}?_cache=${Date.now()}`;
    console.log('Setting preview URL with cache bust:', urlWithTimestamp);
    setPreviewUrl(urlWithTimestamp);
    setPreviewRefreshKey(prev => prev + 1); // Triggered immediately
}
```

**After:**
```typescript
// Update preview and force reload
if (result.previewUrl) {
    const baseUrl = result.previewUrl.split('?')[0].split('#')[0];
    console.log('Setting preview URL:', baseUrl);
    setPreviewUrl(baseUrl);
    // Wait for dev server to rebuild before refreshing preview
    setTimeout(() => {
        setPreviewRefreshKey(prev => prev + 1);
        console.log('Preview refresh triggered - dev server should be ready');
    }, 3000); // 3 second delay to allow rebuild
}
```

**What this does:**
- Removes timestamp from state (cache busting is done in PreviewPanel)
- Adds 3-second delay before triggering iframe refresh
- Gives dev server time to rebuild with new changes

## How It Works Now

1. **AI processes request** and generates unified diffs
2. **n8n workflow applies changes** to workspace files via `/preview/apply`
3. **Dev server detects file changes** and starts rebuilding (automatic)
4. **Frontend receives response** with previewUrl
5. **Frontend waits 3 seconds** for dev server to finish rebuilding
6. **Preview iframe refreshes** with cache busting via `refreshKey` increment
7. **User sees updated content** with changes applied

## Technical Details

### Cache Busting Strategy
The cache busting is handled in `PreviewPanel.tsx` (line 76-81):

```typescript
const getFullPreviewUrl = () => {
    if (!previewUrl) return '';
    const baseUrl = previewUrl.split('?')[0].split('#')[0];
    return `${baseUrl}${currentPage}?_cache=${Date.now()}`;
};
```

This function:
- Takes the base preview URL from state
- Adds the current page path
- Appends a unique timestamp to force browser reload
- Is called every time the iframe renders with a new `key` prop

### Refresh Trigger Mechanism
In `PreviewPanel.tsx` (lines 46-53):

```typescript
React.useEffect(() => {
    if (refreshKey > 0) {
        setIsRefreshing(true);
        setIframeLoaded(false);
        setKey(prev => prev + 1); // Increments iframe key to force remount
        setTimeout(() => setIsRefreshing(false), 1500);
    }
}, [refreshKey]);
```

When `refreshKey` increments:
1. Loading overlay appears (`isRefreshing = true`)
2. Iframe is marked as not loaded yet
3. Iframe `key` increments, forcing React to remount it
4. New iframe loads with fresh timestamp in URL
5. Loading overlay disappears after iframe loads

## Expected Behavior After Fix

When you send: **"change modern shop title to omar shop"**

1. ✅ AI generates unified diffs
2. ✅ Parse Plan extracts JSON successfully
3. ✅ Fly Apply Diff applies changes to workspace files
4. ✅ **Preview shows loading state for 3 seconds**
5. ✅ **Preview iframe refreshes automatically**
6. ✅ **Updated content appears: "Omar Shop" instead of "Modern Shop"**
7. ✅ Changes ready to accept and deploy

## Testing

1. Send a message: "change modern shop to omar shop"
2. Wait for AI response (should say changes were applied)
3. **Wait 3 seconds** - preview will show loading overlay
4. Preview should automatically refresh and show "Omar Shop"
5. Verify changes in both files:
   - src/app/layout.tsx
   - src/components/Header.tsx

## Notes

- The 3-second delay is a safe buffer for Next.js dev server rebuilds
- If your project builds faster, you could reduce this to 2 seconds
- If your project builds slower (large projects), increase to 4-5 seconds
- The cache busting ensures browser doesn't serve stale cached content
- The `refreshKey` mechanism forces iframe to remount with new content

## Files Modified

1. ✅ **`fly-orchestrator/src/index.ts`** (lines 156-191) - Preserve workspace changes
2. ✅ **`src/app/page.tsx`** (lines 558-572) - Added delay before preview refresh
3. ✅ **`src/components/editor/PreviewPanel.tsx`** (already had cache busting and refresh logic)

## Deployment Required

⚠️ **IMPORTANT:** The fly-orchestrator changes require redeployment to Fly.io:

```bash
cd fly-orchestrator
npm run build
flyctl deploy
```

**Deployment Status:** ✅ Deployed on 2025-12-24

## Testing After Deployment

1. **Clear the existing workspace** (force clean slate):
   ```bash
   # Call the orchestrator API to delete workspace
   curl -X POST https://preview-orchestrator.fly.dev/preview/stop \
     -H "Content-Type: application/json" \
     -d '{"siteId":"00000000-0000-0000-0000-000000000001"}'
   ```

2. **Start fresh preview:**
   - Go to your app
   - Click "Show Preview" button
   - Wait for preview to load

3. **Test edit workflow:**
   - Send message: "change modern shop to omar shop"
   - Wait for AI response (should confirm changes applied)
   - **Wait 3 seconds** - preview shows loading
   - Preview should refresh automatically
   - **Verify:** Title should now say "Omar Shop"

4. **Test persistence:**
   - Send another message: "make the background blue"
   - AI applies new changes
   - **Verify:** Both changes are present (Omar Shop + blue background)
   - Changes should NOT be lost between edits!

## Troubleshooting

### Changes still not showing?

1. **Check fly-orchestrator logs:**
   ```bash
   flyctl logs -a preview-orchestrator
   ```
   Look for: "Workspace has uncommitted changes for ... , preserving them..."

2. **Verify workspace has changes:**
   - Log into the workspace on Fly.io machine
   - Check if files actually changed

3. **Check if dev server restarted:**
   - Look for rebuild output in orchestrator logs
   - Dev server should auto-detect file changes

### Preview showing old content?

- Hard refresh browser: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- Clear browser cache
- Check browser console for errors

### Workspace keeps resetting?

- Ensure you deployed the latest fly-orchestrator code
- Check that `git status --porcelain` is detecting changes
- Verify the workspace mount persists across restarts

## Related Documents

- `n8n/COMPLETE-FIX-INSTRUCTIONS.md` - n8n workflow fixes
- `n8n/IMPROVED-PARSE-PLAN.js` - Robust JSON extraction
- `PREVIEW-IMPROVEMENTS.md` - Cache clearing and page selector implementation
