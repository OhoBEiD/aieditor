# Preview System Setup Guide (Netlify)

## 1️⃣ Cloudflare DNS (2 min)

Add in Cloudflare → DNS → Records:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `*.preview` | `your-site.netlify.app` | ❌ DNS only |

> **Note:** Use "DNS only" (gray cloud) for Netlify compatibility.

---

## 2️⃣ Netlify Setup (10 min)

### Create Site
1. Go to [Netlify](https://app.netlify.com)
2. Add New Site → Import from Git → Connect your repo
3. Note your site name (e.g., `aieditor-preview`)

### Add Custom Domain
1. Site Settings → Domain management → Add custom domain
2. Add: `*.preview.automatelb.com`
3. Netlify will show "Awaiting external DNS" - that's OK

### Get API Token
1. User Settings → Applications → Personal Access Tokens
2. Create new token: `ai-editor-preview`
3. Save token as `NETLIFY_TOKEN`

### Get Site ID
1. Site Settings → General → Site ID
2. Copy the ID (looks like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

---

## 3️⃣ n8n Workflow (5 min)

1. Import `n8n/preview-deploy-workflow.json` 
2. Add credential: HTTP Header Auth
   - Header: `Authorization`
   - Value: `Bearer YOUR_NETLIFY_TOKEN`
3. Set environment variables:
   ```
   NETLIFY_SITE_ID=your-site-id
   PREVIEW_DOMAIN=preview.automatelb.com
   ```

---

## 4️⃣ Test

```bash
curl -X POST https://your-n8n.com/webhook/preview/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "demo",
    "repoUrl": "https://github.com/org/repo",
    "branch": "test-branch",
    "requestId": "req_123"
  }'
```

Expected response: `https://demo.preview.automatelb.com`
