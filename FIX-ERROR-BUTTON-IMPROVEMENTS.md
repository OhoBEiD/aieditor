# Fix Error Button Improvements

## Changes Made

Updated the "Fix Error" button in the preview panel to be more intelligent and useful.

## Problem

The "Fix Error" button was:
1. **Always visible** - appeared even when there were no errors
2. **Not helpful** - sent a generic message asking the AI to check the preview panel instead of including the actual error

## Solution

### 1. Only Show Button When There's a Build Error

The button now only appears when the preview actually has a build/compilation error detected.

### 2. Include Actual Error Message

When clicked, the button now sends the actual error text to the AI:
```
Please fix the following build error:

[actual error message from Next.js]
```

Instead of the old generic message:
```
Please fix the build error shown in the preview. The error message is displayed in the preview panel.
```

## Implementation Details

### Error Detection Methods

Three approaches to detect build errors:

#### 1. PostMessage Listener (Lines 50-70)
Listens for error messages from the iframe via `window.postMessage`:
- `webpack-error` events
- `build-error` events
- `build-ok` events (clears errors)

#### 2. On Load Check (Lines 134-163)
When the iframe loads, checks the DOM for Next.js error overlays:
- `nextjs-portal`
- `[data-nextjs-dialog-overlay]`
- `#__next-build-error`

Extracts the error text from these elements.

#### 3. Periodic Polling (Lines 72-104)
Every 2 seconds, checks the iframe content for error overlays.

This ensures errors are caught even if they appear after the initial page load.

### State Management

Added `buildError` state:
```typescript
const [buildError, setBuildError] = useState<string | null>(null);
```

- `null` = no error
- `string` = error message text

### Button Visibility

The button only renders when both conditions are met:
```typescript
{onFixError && buildError && (
    <button onClick={() => onFixError(`Please fix the following build error:\n\n${buildError}`)}>
        Fix Error
    </button>
)}
```

## Files Changed

- [src/components/editor/PreviewPanel.tsx](src/components/editor/PreviewPanel.tsx)
  - Line 43: Added `buildError` state
  - Lines 50-70: Added postMessage listener for errors
  - Lines 72-104: Added periodic error checking
  - Lines 134-163: Enhanced `handleIframeLoad` to check for errors
  - Lines 283-292: Updated button to only show when `buildError` exists and include error in message

## Benefits

✅ **Better UX** - Button only appears when needed, not cluttering the UI

✅ **More Helpful** - AI receives the actual error message, can provide targeted fixes

✅ **Robust Detection** - Multiple methods ensure errors are caught reliably

✅ **Auto-Clear** - Errors automatically clear when fixed (no error overlay = no button)

## Testing

To test:

1. **Create a build error** - Edit a file to introduce a syntax error or import error
2. **Check preview** - The Next.js error overlay should appear
3. **Verify button** - "Fix Error" button should appear in the toolbar
4. **Click button** - Should send a message with the actual error text
5. **Fix the error** - Have AI fix it or fix manually
6. **Verify clear** - Button should disappear once error is resolved

## Example Error Message

When a TypeScript error occurs:

**Before (old):**
```
Please fix the build error shown in the preview. The error message is displayed in the preview panel.
```

**After (new):**
```
Please fix the following build error:

Failed to compile
./src/components/Header.tsx
Type error: Property 'title' does not exist on type 'HeaderProps'.
```

Much more actionable for the AI!
