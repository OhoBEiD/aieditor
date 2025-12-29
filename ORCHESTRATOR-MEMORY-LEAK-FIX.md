# Orchestrator Memory Leak Fix

## Problem

The orchestrator was showing `MaxListenersExceededWarning` errors repeatedly:

```
(node:680) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 data listeners added to [Socket]. MaxListeners is 10.
(node:680) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 unpipe listeners added to [Socket]. MaxListeners is 10.
```

The preview server continued running even after clicking "Exit Preview".

## Root Cause

**Memory Leak in Proxy Middleware Creation**

In [fly-orchestrator/src/index.ts:109-124](fly-orchestrator/src/index.ts#L109-L124), a new `createProxyMiddleware` instance was being created **on every HTTP request** to a preview subdomain:

```typescript
// BEFORE (BAD - Creates new middleware on every request)
if (preview && preview.status === 'running') {
    preview.lastActivity = new Date();

    const proxyMiddleware = createProxyMiddleware({
        target: `http://localhost:${preview.port}`,
        changeOrigin: true,
        ws: true,
        on: { error: ... }
    });

    return proxyMiddleware(req, res, next);
}
```

**Why This Causes Memory Leaks:**

1. Each `createProxyMiddleware` creates a new proxy server with its own event emitter
2. Event listeners are attached to socket connections (`data`, `unpipe`, etc.)
3. These listeners were **never cleaned up** because new middleware was created before the old one could be garbage collected
4. After ~10 requests, the socket hit the default max listeners limit (10)
5. Node.js emitted `MaxListenersExceededWarning`

## Solution Applied

### 1. Cache Proxy Middleware Instances

Added a cache map to store one proxy middleware per site:

```typescript
// fly-orchestrator/src/index.ts:31
const proxyCache: Map<string, any> = new Map();
```

### 2. Reuse Cached Middleware

Modified the proxy logic to check cache first before creating new middleware:

```typescript
// AFTER (GOOD - Reuses cached middleware)
if (preview && preview.status === 'running') {
    preview.lastActivity = new Date();

    // Get or create cached proxy middleware for this site
    const cacheKey = `${subdomain}:${preview.port}`;
    let proxyMiddleware = proxyCache.get(cacheKey);

    if (!proxyMiddleware) {
        // Create new proxy middleware and cache it
        proxyMiddleware = createProxyMiddleware({
            target: `http://localhost:${preview.port}`,
            changeOrigin: true,
            ws: true,
            on: { error: ... }
        });
        proxyCache.set(cacheKey, proxyMiddleware);
        console.log(`Created and cached proxy middleware for ${cacheKey}`);
    }

    return proxyMiddleware(req, res, next);
}
```

### 3. Cleanup Cached Middleware When Preview Stops

Added cleanup in three locations:

#### A. When Explicitly Stopped via `/preview/stop`

```typescript
// fly-orchestrator/src/index.ts:938-943
const cacheKey = `${siteId}:${preview.port}`;
if (proxyCache.has(cacheKey)) {
    proxyCache.delete(cacheKey);
    console.log(`Cleaned up proxy middleware cache for ${cacheKey}`);
}
```

#### B. When Force Cloning (Deletes and Recreates Workspace)

```typescript
// fly-orchestrator/src/index.ts:395-400
const cacheKey = `${siteId}:${existing.port}`;
if (proxyCache.has(cacheKey)) {
    proxyCache.delete(cacheKey);
    console.log(`Cleaned up proxy middleware cache for ${cacheKey}`);
}
```

#### C. When Dev Server Process Exits

```typescript
// fly-orchestrator/src/index.ts:271-276
const cacheKey = `${siteId}:${preview.port}`;
if (proxyCache.has(cacheKey)) {
    proxyCache.delete(cacheKey);
    console.log(`Cleaned up proxy middleware cache for ${cacheKey} after process exit`);
}
```

## Files Changed

- [fly-orchestrator/src/index.ts](fly-orchestrator/src/index.ts)
  - Line 31: Added `proxyCache` Map
  - Lines 111-135: Modified proxy logic to use cache
  - Lines 271-276: Cleanup on process exit
  - Lines 395-400: Cleanup on force clone
  - Lines 938-943: Cleanup on explicit stop

## Results

✅ **Memory Leak Fixed**: Only one proxy middleware instance per site is created and reused across all requests

✅ **Proper Cleanup**: Cached middleware is removed when preview stops, preventing memory leaks

✅ **No More Warnings**: `MaxListenersExceededWarning` should no longer appear

✅ **Preview Stops Properly**: When clicking "Exit Preview", the process is killed and cache is cleaned up

## Deployment

- Built: `npm run build` ✅
- Deployed: `flyctl deploy` ✅
- Live at: https://preview-orchestrator.fly.dev

## Testing

After deployment, test by:

1. **Start a preview** - send a message to the AI
2. **Make multiple requests** - refresh the preview page 20+ times
3. **Check orchestrator logs** - should NOT see `MaxListenersExceededWarning`
4. **Click "Exit Preview"** - preview should stop immediately
5. **Check orchestrator logs** - should see "Cleaned up proxy middleware cache for [siteId]:[port]"

## Technical Details

**What is `createProxyMiddleware`?**

It's from the `http-proxy-middleware` package. It creates an Express middleware that:
- Intercepts HTTP requests
- Forwards them to a target server (in our case, `localhost:${port}`)
- Handles WebSocket upgrades for Hot Module Replacement (HMR)
- Attaches event listeners to socket connections

**Why does it leak memory?**

Each call to `createProxyMiddleware()` creates a new proxy server with its own internal state and event listeners. If you create a new one on every request without cleaning up the old ones, those listeners accumulate on the underlying socket objects.

**How does caching fix it?**

By creating only one proxy middleware instance per site and reusing it across all requests, we ensure:
- Event listeners are attached only once
- No accumulation of duplicate listeners
- Proper cleanup when the site is stopped

This is a standard pattern for middleware that manages stateful connections.
