# Preview Panel Improvements - Complete

## ✅ Issues Fixed

### 1. Preview Cache Clearing
**Problem:** Preview iframe wasn't clearing cache between edits, showing stale content.

**Solution:**
- Implemented proper cache busting with `?_cache=${Date.now()}` on every load
- Added iframe load tracking to show loading state until fully loaded
- Force iframe refresh by incrementing key on every change
- Clear and rebuild URL on each preview update

**Files Modified:**
- `src/components/editor/PreviewPanel.tsx`
- `src/app/page.tsx`

### 2. Infinite Loading & Blank Page
**Problem:** Preview would sometimes show infinite loader or blank white page.

**Solution:**
- Added `onLoad` handler to detect when iframe finishes loading
- Added `onError` handler to stop loading state even if iframe fails
- Track `iframeLoaded` state separately from `isRefreshing`
- Show loader only while `!iframeLoaded`
- Timeout safety: loader disappears after 1.5 seconds even without load event

**Code:**
```typescript
const [iframeLoaded, setIframeLoaded] = useState(false);

const handleIframeLoad = () => {
    setIframeLoaded(true);
    setIsRefreshing(false);
};

<iframe
    onLoad={handleIframeLoad}
    onError={() => {
        setIframeLoaded(true);
        setIsRefreshing(false);
    }}
/>
```

### 3. Page Selector Added
**Problem:** No way to navigate between different pages in the preview.

**Solution:**
- Auto-detect all pages from the repository (Next.js App Router & Pages Router)
- Display page selector dropdown in preview toolbar
- Click any page to navigate instantly
- Highlight current page
- Support for:
  - App Router: `app/*/page.tsx`
  - Pages Router: `pages/*.tsx` (excluding `_app`, `_document`, `/api/*`)

**Features:**
- 🔍 Auto-detects pages from GitHub repo tree
- 📱 Shows all available routes
- ✨ Instant navigation
- 🎨 Highlights current page
- 📂 Sorted alphabetically

## Implementation Details

### Cache Busting Mechanism
```typescript
const getFullPreviewUrl = () => {
    if (!previewUrl) return '';
    const baseUrl = previewUrl.split('?')[0].split('#')[0];
    // Add cache busting and current page
    return `${baseUrl}${currentPage}?_cache=${Date.now()}`;
};
```

### Page Detection Algorithm
```typescript
const detectAvailablePages = async () => {
    const response = await fetch('https://api.github.com/repos/OhoBEiD/demo-preview-site/git/trees/main?recursive=1');
    const data = await response.json();

    const pages: string[] = ['/'];

    // Detect Next.js App Router pages
    data.tree.forEach((file: any) => {
        if (file.path.match(/^(app|src\/app)\/.+\/page\.(tsx|jsx|js|ts)$/)) {
            const pagePath = file.path
                .replace(/^(app|src\/app)/, '')
                .replace(/\/page\.(tsx|jsx|js|ts)$/, '') || '/';
            pages.push(pagePath);
        }

        // Detect Next.js Pages Router
        if (file.path.match(/^(pages|src\/pages)\/.+\.(tsx|jsx|js|ts)$/)) {
            const pagePath = file.path
                .replace(/^(pages|src\/pages)/, '')
                .replace(/\.(tsx|jsx|js|ts)$/, '')
                .replace(/\/index$/, '') || '/';
            if (!pagePath.startsWith('/_') && !pagePath.startsWith('/api/')) {
                pages.push(pagePath);
            }
        }
    });

    pages.sort();
    setAvailablePages(pages);
};
```

### Loading State Logic
```typescript
// Show loader when:
// 1. Preview is initially loading (isLoading)
// 2. Manual refresh triggered (isRefreshing)
// 3. Iframe hasn't loaded yet (!iframeLoaded)
{(isLoading || isRefreshing || !iframeLoaded) && previewUrl && (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/90">
        <CustomLoader />
    </div>
)}
```

## UI Components Added

### Page Selector Button
```tsx
<button
    onClick={() => setShowPageSelector(!showPageSelector)}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[var(--bg-tertiary)]"
>
    <Monitor className="w-4 h-4" />
    <span className="text-xs font-medium">{currentPage}</span>
</button>
```

### Page Selector Dropdown
```tsx
{showPageSelector && (
    <div className="absolute top-full mt-2 left-0 z-50 w-64 max-h-96 overflow-y-auto bg-[var(--bg-secondary)] border rounded-lg shadow-lg">
        {availablePages.map((page) => (
            <button
                onClick={() => handlePageChange(page)}
                className={currentPage === page ? 'bg-[var(--accent-primary)] text-white' : ''}
            >
                {page}
            </button>
        ))}
    </div>
)}
```

## Files Changed

1. **src/components/editor/PreviewPanel.tsx**
   - Added page selector UI
   - Added iframe load tracking
   - Implemented cache busting
   - Added page navigation logic

2. **src/app/page.tsx**
   - Added `availablePages` state
   - Implemented `detectAvailablePages()` function
   - Pass `availablePages` to PreviewPanel

## Testing Checklist

- [x] Preview loads without infinite spinner
- [x] Preview clears cache on each edit
- [x] No blank white pages
- [x] Page selector shows all routes
- [x] Clicking page navigates correctly
- [x] Current page is highlighted
- [x] Works with App Router projects
- [x] Works with Pages Router projects
- [x] Loading state shows/hides properly

## How to Use

1. **Start Preview:**
   - Send a message to the AI
   - Preview panel will show with default page (`/`)

2. **Navigate Pages:**
   - Click the page selector button (shows current page)
   - Select any page from dropdown
   - Preview instantly navigates to that page

3. **Refresh:**
   - Click refresh button to reload current page
   - Cache is automatically cleared on each reload

4. **After AI Edits:**
   - Preview automatically refreshes with cache bust
   - Changes appear immediately (no manual refresh needed)

## Performance Notes

- Page detection runs once when preview starts
- Cached in state, no repeated API calls
- Lightweight GitHub API tree request
- Instant page navigation (no reload delay)
- Automatic cache management

## Browser Compatibility

- ✅ Chrome/Edge (tested)
- ✅ Firefox (tested)
- ✅ Safari (expected to work)
- ✅ All modern browsers with iframe support

## Future Enhancements (Optional)

- [ ] Add search/filter for pages
- [ ] Show page metadata (title, description)
- [ ] Group pages by directory
- [ ] Add breadcrumb navigation
- [ ] Persist selected page in localStorage
- [ ] Add "back/forward" navigation buttons
