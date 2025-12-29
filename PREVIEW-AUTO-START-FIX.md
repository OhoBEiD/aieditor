# Preview Auto-Start Fix

## Problem
Preview wasn't starting automatically when opening the project, requiring users to manually send a message to trigger it.

## Solution Applied

### 1. Auto-Start Preview on Load

Added automatic preview startup in [src/app/page.tsx](src/app/page.tsx#L410-L416):

```typescript
// Auto-start preview when showPreview is true and preview isn't loaded yet
useEffect(() => {
    if (isClient && showPreview && !previewUrl && !isPreviewLoading) {
        console.log('[Preview] Auto-starting preview on load...');
        startPreview();
    }
}, [isClient, showPreview, previewUrl, isPreviewLoading, startPreview]);
```

**How it works:**
- Runs after the component mounts on the client
- Checks if preview mode is enabled (`showPreview === true`)
- Checks if preview isn't already loaded (`!previewUrl`)
- Checks if preview isn't currently loading (`!isPreviewLoading`)
- Calls `startPreview()` to initialize the preview server

### 2. Stop Preview Server on Exit

Updated the exit preview handler in [src/app/page.tsx](src/app/page.tsx#L351-L368):

```typescript
const handleExitPreview = useCallback(async () => {
    setShowPreview(false);
    setPreviewUrl(undefined);
    // Clear preview URL from localStorage when exiting
    localStorage.removeItem('previewUrl');

    // Stop the preview server
    try {
        await fetch('https://preview-orchestrator.fly.dev/preview/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteId: DEMO_CLIENT_ID })
        });
        console.log('[Preview] Preview server stopped');
    } catch (err) {
        console.error('[Preview] Failed to stop preview server:', err);
    }
}, []);
```

**How it works:**
- Hides the preview panel
- Clears the preview URL from state and localStorage
- Sends a stop request to the orchestrator to kill the dev server
- Frees up server resources when preview is not needed

## User Experience Flow

### Opening the Project:
1. User visits the site
2. Page loads with `showPreview: true` (default)
3. Auto-start effect triggers
4. Preview server starts in background (60-90 seconds)
5. Preview URL appears when ready
6. User sees the preview automatically

### Exiting Preview:
1. User clicks "Exit Preview" button
2. Preview panel hides
3. Preview server stops on orchestrator
4. User returns to landing page
5. Resources freed up

### Re-entering Preview:
1. User sends a message from landing page
2. Preview re-starts automatically
3. Shows preview with response

## Technical Details

### State Management:
- `showPreview`: Controls whether to show preview panel
- `previewUrl`: The actual preview URL from orchestrator
- `isPreviewLoading`: Loading state during server startup

### LocalStorage Persistence:
- `showPreview`: Saved to remember user preference
- `previewUrl`: Saved to restore preview on page reload
- Cleared when exiting preview

### Server Lifecycle:
1. **Start**: POST `/preview/start` → Clones repo, installs deps, starts Next.js dev server
2. **Run**: Proxy requests to `https://[siteId].preview.automatelb.com`
3. **Stop**: POST `/preview/stop` → Kills dev server process

## Benefits

✅ **Better UX**: Preview loads automatically on visit
✅ **Resource Efficiency**: Server stops when not needed
✅ **Faster Experience**: Preview ready without user action
✅ **Cleaner State**: Proper cleanup on exit

## Testing

1. **Test Auto-Start**:
   - Open the app in browser
   - Wait 60-90 seconds
   - Preview should appear automatically

2. **Test Exit**:
   - Click "Exit Preview" button
   - Should return to landing page
   - Check orchestrator logs: `fly logs -a preview-orchestrator`
   - Should see "Preview stopped" message

3. **Test Re-Entry**:
   - From landing page, send a message
   - Preview should start again

## Monitoring

Check orchestrator logs to verify:

```bash
# Watch logs
fly logs -a preview-orchestrator

# Look for these messages:
# - "Starting dev server for [siteId]"
# - "Server ready on port 3100!"
# - "Preview stopped"
```

## Summary

The preview now:
- ✅ Starts automatically when opening the project
- ✅ Stops when exiting preview mode
- ✅ Preserves resources by shutting down unused servers
- ✅ Provides smooth user experience with no manual triggers needed
