# Preview System Setup Guide

Quick-start guide to get preview deployments working.

## 1️⃣ Cloudflare DNS (5 min)

1. Go to Cloudflare Dashboard → your domain → DNS
2. Add record:
   - **Type**: CNAME
   - **Name**: `*.preview`
   - **Target**: `cname.vercel-dns.com`
   - **Proxy**: ✅ Enabled

## 2️⃣ Vercel Setup (10 min)

1. Create new Vercel project (can be empty)
2. Settings → Domains → Add `*.preview.yourdomain.com`
3. Settings → Tokens → Create token (Full Account scope)
4. Save token as `VERCEL_TOKEN`

## 3️⃣ n8n Workflow (5 min)

1. Import `/n8n/preview-deploy-workflow.json`
2. Add credential: HTTP Header Auth
   - Header: `Authorization`
   - Value: `Bearer YOUR_VERCEL_TOKEN`
3. Set environment variables:
   - `PREVIEW_DOMAIN=preview.yourdomain.com`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Activate workflow

## 4️⃣ Supabase Schema (2 min)

Run `/supabase/migrations/002_preview_system.sql` in SQL Editor.

## 5️⃣ Connect to Main Workflow

Update `PREVIEW_DEPLOY_WEBHOOK_URL` in your main n8n workflow to point to:
```
https://your-n8n.com/webhook/preview/deploy
```

## ✅ Test

```bash
curl -X POST https://your-n8n.com/webhook/preview/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "test-client",
    "repoUrl": "https://github.com/your-org/test-repo",
    "branch": "test-branch",
    "requestId": "req_test123"
  }'
```

Expected: `https://test-client.preview.yourdomain.com`
