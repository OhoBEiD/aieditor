# Fixes Applied - Summary

## Issues Fixed

### 1. ✅ Git LFS Error (node_modules too large)
**Problem:** When deploying, git was trying to push node_modules folder which contains files >100MB, exceeding GitHub's limit.

**Solution:**
- Added `.gitignore` to fly-orchestrator workspace
- Updated deploy endpoint to automatically ensure .gitignore excludes node_modules before every commit
- File: `fly-orchestrator/src/index.ts` (lines 679-690)

**Code added:**
```javascript
// Ensure .gitignore excludes node_modules to prevent large file errors
const gitignorePath = path.join(workspacePath, '.gitignore');
try {
    let gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    if (!gitignoreContent.includes('node_modules')) {
        gitignoreContent += '\nnode_modules/\n';
        await fs.writeFile(gitignorePath, gitignoreContent, 'utf-8');
    }
} catch {
    // .gitignore doesn't exist, create it
    await fs.writeFile(gitignorePath, 'node_modules/\n.next/\n.turbo/\ndist/\nbuild/\n', 'utf-8');
}
```

### 2. ✅ Preview Cache Not Clearing
**Problem:** After AI edits, preview iframe wasn't refreshing to show new changes due to browser cache.

**Solution:**
- Improved cache-busting mechanism in page.tsx
- Changed from timestamp query param to `?_cache=` parameter
- Strip existing query params before adding new cache param
- File: `src/app/page.tsx` (lines 508-519)

**Code updated:**
```javascript
// Update preview and force reload by adding timestamp
if (result.previewUrl) {
    // Add timestamp to force iframe reload and clear cache
    const baseUrl = result.previewUrl.split('?')[0].split('#')[0];
    const urlWithTimestamp = `${baseUrl}?_cache=${Date.now()}`;
    console.log('Setting preview URL with cache bust:', urlWithTimestamp);
    setPreviewUrl(urlWithTimestamp);
    // Trigger preview refresh
    setPreviewRefreshKey(prev => prev + 1);
} else {
    console.warn('No preview URL in result:', result);
}
```

### 3. ✅ Accept Button Already Visible
**Problem:** User reported Accept button only appears with preview off.

**Status:** ✅ Already working correctly!
- The Accept button is already in ChatPanel.tsx (lines 103-129)
- It appears when `hasChanges={true}` regardless of preview state
- File: `src/components/chat/ChatPanel.tsx`

The button shows in the chat panel whenever there are pending changes, whether preview is on or off.

## Files Modified

1. **fly-orchestrator/src/index.ts**
   - Added automatic .gitignore creation/update before commits
   - Prevents node_modules from being staged

2. **fly-orchestrator/.gitignore** (created)
   - Excludes node_modules, dist, workspaces from version control

3. **src/app/page.tsx**
   - Improved preview URL cache busting
   - Added logging for debugging preview issues
   - Better error handling when previewUrl is missing

4. **fly-orchestrator/dist/** (rebuilt)
   - Compiled TypeScript with latest changes

## How to Test

### Test 1: Deploy without Git LFS error
1. Make an AI edit
2. Click "Accept Changes"
3. Should commit and push successfully without "file too large" error

### Test 2: Preview cache clearing
1. Ask AI to "change title to Test Shop"
2. Wait for response
3. Preview should automatically refresh and show new title
4. Check browser console for: "Setting preview URL with cache bust: ..."

### Test 3: Accept button visibility
1. With preview ON, make an edit
2. Accept button should appear at bottom of chat panel (green button)
3. Toggle preview OFF
4. Accept button should still be visible

## Next Steps

1. **Restart fly-orchestrator** to apply the .gitignore fix:
   ```bash
   cd fly-orchestrator
   npm run dev
   ```

2. **Test a full workflow:**
   - Send message: "change title to My Shop"
   - Wait for AI response
   - Verify preview updates automatically
   - Click "Accept Changes"
   - Verify commit succeeds without errors

3. **Monitor console logs** for cache-busting URLs to ensure it's working

## Technical Details

### Preview Refresh Mechanism
- Every AI response triggers `setPreviewRefreshKey(prev => prev + 1)`
- PreviewPanel listens to `refreshKey` prop changes
- When refreshKey changes, iframe key is incremented forcing reload
- URL gets `?_cache=timestamp` to bypass browser cache

### Git LFS Prevention
- Before every commit, code checks if .gitignore exists
- If not, creates it with node_modules exclusion
- If exists but missing node_modules, appends it
- git add -A will now skip node_modules automatically

### Accept Button Logic
- Button appears when `hasChanges={true}`
- ChatPanel component (lines 103-129)
- Independent of preview state
- Shows at bottom of chat panel above message input
