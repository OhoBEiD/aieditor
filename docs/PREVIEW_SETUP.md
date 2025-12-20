# Preview System Setup Guide (Cloudflare Pages)

## ✅ You've Already Done
- Created Cloudflare Pages project

## Next Steps

### 1. Add Custom Domain (2 min)

In Cloudflare Pages project → Custom domains:
1. Add `*.preview.automatelb.com`
2. Cloudflare will auto-configure DNS ✨

### 2. Get API Token (2 min)

1. Cloudflare Dashboard → My Profile → API Tokens
2. Create Token → "Edit Cloudflare Workers" template (or custom)
3. Permissions needed:
   - Account: Cloudflare Pages: Edit
4. Save token as `CLOUDFLARE_API_TOKEN`

### 3. Get Account ID & Project Name

1. Pages project → right sidebar → "Account ID" → Copy
2. Note your project name (e.g., `aieditor-preview`)

### 4. Set n8n Environment Variables

```
CLOUDFLARE_API_TOKEN=your_token
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_PROJECT_NAME=your_project_name
PREVIEW_DOMAIN=preview.automatelb.com
```

### 5. Import n8n Workflow

Import `n8n/preview-deploy-workflow.json` and activate.

---

## Test

```bash
curl -X POST https://your-n8n.com/webhook/preview/deploy \
  -H "Content-Type: application/json" \
  -d '{"clientId":"demo","repoUrl":"https://github.com/org/repo","branch":"main","requestId":"test123"}'
```

Result: `https://demo.preview.automatelb.com`
