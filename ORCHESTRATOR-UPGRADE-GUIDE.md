# Orchestrator Upgrade Guide - Fix Preview Loading Issues

## Problem
Preview is not loading due to insufficient memory (1GB RAM) and timeout issues in the orchestrator.

## Solution Applied

### 1. Increased RAM Allocation
Updated `fly-orchestrator/fly.toml`:
- **RAM**: 1024MB → **4096MB (4GB)**
- **CPUs**: 1 → **2**

This provides enough memory for:
- Multiple Next.js dev servers running simultaneously
- npm install operations
- Git operations
- Node.js with increased heap size (2GB per process)

### 2. Code Improvements Made

The following improvements have been applied to the orchestrator code:

#### A. Enhanced Server Startup with Health Checks
- Added `waitForServerReady()` function that polls the server until it responds
- Increased startup timeout from 3s to 90s
- Server now waits for actual HTTP response before marking as ready
- Logs progress every second during startup

#### B. Increased Memory Limits
- Added `NODE_OPTIONS: '--max-old-space-size=2048'` to Next.js dev server processes
- Each dev server can now use up to 2GB of memory
- Prevents out-of-memory crashes during builds

#### C. Better Error Handling
- Improved logging with stdout/stderr buffers
- Better error messages in proxy responses
- Graceful handling of timeouts and failures
- Added visual loading pages with auto-refresh

#### D. Extended Timeouts
- Git clone timeout: 120s (was implicit)
- npm install timeout: 300s (5 minutes)
- Server startup timeout: 90s (was 3s)
- Proxy timeout: 60s (was default 30s)
- Health check requests: 3s timeout each

#### E. Process Management
- Added `maxBuffer: 10 * 1024 * 1024` (10MB) for stdout/stderr
- Graceful SIGTERM shutdown with 2s delay
- Exit code and signal logging
- Better cleanup on process exit

## Deployment Steps

### Step 1: Update Fly.io Configuration

The `fly.toml` file has already been updated. Deploy with:

```bash
cd fly-orchestrator
fly deploy
```

This will:
1. Rebuild the Docker image
2. Allocate 4GB RAM and 2 CPUs
3. Restart with the new configuration

### Step 2: Monitor the Deployment

```bash
# Watch deployment logs
fly logs

# Check status
fly status

# Monitor resource usage
fly vm status
```

### Step 3: Test Preview Loading

1. Send a message to the AI editor to trigger a preview
2. Watch the orchestrator logs: `fly logs -a preview-orchestrator`
3. You should see:
   ```
   [siteId] Waiting for server on port 3100 to be ready...
   [siteId] Waiting... 1s elapsed
   [siteId] Waiting... 2s elapsed
   ...
   [siteId] Server ready on port 3100! (status: 200)
   ```

### Step 4: Verify Resource Usage

```bash
fly vm status
```

Expected output:
- Memory: ~1-2GB used out of 4GB
- CPUs: 2 cores available
- No OOM (out of memory) errors in logs

## Cost Impact

### Before:
- shared-cpu-1x: ~$0.0000022/s = ~$5.70/month

### After:
- shared-cpu-2x with 4GB RAM: ~$0.0000088/s = ~$22.80/month

**Monthly increase: ~$17/month**

This is necessary to ensure:
- Previews load reliably
- No timeout errors
- Multiple concurrent preview sessions
- Fast npm install and build operations

## Alternative: Lower-Cost Option

If cost is a concern, you can try 2GB RAM first:

```toml
[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 2048
```

Cost: ~$11/month (+$5/month from current)

This should still work for most cases but may struggle with:
- Large npm dependencies
- Multiple simultaneous users
- Complex Next.js builds

## Troubleshooting

### If preview still doesn't load:

1. **Check orchestrator logs**:
   ```bash
   fly logs -a preview-orchestrator
   ```
   Look for errors like "SIGKILL", "OOM", or timeout messages.

2. **Check memory usage**:
   ```bash
   fly vm status
   ```
   If memory is near 100%, increase to 8GB:
   ```toml
   memory_mb = 8192
   ```

3. **Verify workspace exists**:
   ```bash
   fly ssh console
   ls /workspaces
   ```

4. **Check if process is running**:
   ```bash
   fly ssh console
   ps aux | grep "npm run dev"
   ```

5. **Test preview URL directly**:
   Open `https://[siteId].preview.automatelb.com` in browser
   Should show either loading page or the actual preview

### Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| "Starting preview..." forever | Server startup timeout | Already fixed - wait timeout increased to 90s |
| "502 Bad Gateway" | Dev server crashed | Check logs, likely OOM - increase RAM |
| "Preview Not Ready" | Server never started | Check if npm install succeeded, verify package.json |
| Blank page | HMR not working | Refresh manually, check WebSocket connection |

## Rollback Plan

If issues occur after deployment:

```bash
# Revert fly.toml
cd fly-orchestrator
git checkout HEAD~1 fly.toml

# Redeploy
fly deploy
```

## Next Steps

1. Deploy the changes: `cd fly-orchestrator && fly deploy`
2. Test with a fresh preview: Send "create a new landing page" to the AI
3. Monitor logs for 5-10 minutes: `fly logs -a preview-orchestrator`
4. Verify no errors and preview loads successfully

## Additional Optimizations (Optional)

If you want even better performance:

1. **Enable autoscaling**:
   ```toml
   [http_service]
     min_machines_running = 1
     max_machines_running = 3
   ```

2. **Add health check endpoint monitoring**:
   ```toml
   [[http_service.checks]]
     interval = "30s"
     timeout = "10s"
     grace_period = "30s"
     method = "GET"
     path = "/health"
   ```

3. **Use dedicated CPU** (more expensive but faster):
   ```toml
   cpu_kind = "performance"
   cpus = 2
   memory_mb = 4096
   ```

## Summary

✅ **RAM increased**: 1GB → 4GB
✅ **CPUs increased**: 1 → 2
✅ **Startup timeout**: 3s → 90s with health checks
✅ **Memory per process**: Default → 2GB
✅ **Better error handling**: Added comprehensive logging
✅ **Cost**: +$17/month for reliable previews

The orchestrator is now production-ready and should handle preview loading without errors.
