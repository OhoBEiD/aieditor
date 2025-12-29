# n8n Self-Hosted on Fly.io

No more timeout issues! Self-hosted n8n with 10+ minute execution time.

## Quick Deploy

```bash
cd n8n-fly
chmod +x deploy.sh
./deploy.sh
```

## Manual Deploy

```bash
# 1. Create volume
fly volumes create n8n_data --region cdg --size 1

# 2. Launch app
fly launch --config fly.toml --no-deploy

# 3. Set secrets
fly secrets set N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)
fly secrets set GITHUB_TOKEN=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

# 4. Deploy
fly deploy
```

## Access

**URL:** https://n8n-ai-editor.fly.dev

## After Deploy

1. Update your app's webhook URL:
   ```
   N8N_WEBHOOK_URL=https://n8n-ai-editor.fly.dev/webhook/agent/edit-ui
   ```

2. Set in `.env.local`:
   ```
   N8N_WEBHOOK_URL=https://n8n-ai-editor.fly.dev/webhook/agent/edit-ui
   ```

## Timeout Configuration

| Setting | Value | Meaning |
|---------|-------|---------|
| EXECUTIONS_TIMEOUT | 600 | 10 minutes per execution |
| EXECUTIONS_TIMEOUT_MAX | 3600 | 1 hour maximum |

## Useful Commands

```bash
# View logs
fly logs --app n8n-ai-editor

# SSH into container
fly ssh console --app n8n-ai-editor

# Restart
fly apps restart n8n-ai-editor

# Scale up memory
fly scale memory 2048 --app n8n-ai-editor
```

## Cost

~$5-6/month
