# Fly.io Preview Orchestrator

This service manages instant preview environments for the AI Editor.

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/preview/start` | POST | Start or ensure preview is running |
| `/preview/apply` | POST | Apply unified diff to workspace |
| `/preview/status` | POST | Get preview status |
| `/preview/stop` | POST | Stop a preview |
| `/preview/deploy` | POST | Commit changes and create PR |
| `/health` | GET | Health check |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3001 |
| `PREVIEW_DOMAIN` | Domain for preview URLs | preview.automatelb.com |
| `WORKSPACES_DIR` | Directory for site workspaces | /workspaces |
| `GITHUB_TOKEN` | GitHub token for PR creation | - |

## Deployment to Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Create app (first time only)
fly apps create preview-orchestrator

# Create volume for workspaces
fly volumes create workspaces_data --size 10 --region ams

# Set secrets
fly secrets set GITHUB_TOKEN=your_github_token

# Deploy
fly deploy
```

## Local Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

## Request Examples

### Start Preview
```bash
curl -X POST http://localhost:3001/preview/start \
  -H "Content-Type: application/json" \
  -d '{"siteId": "abc123", "repoUrl": "https://github.com/user/repo", "branch": "main"}'
```

### Apply Diff
```bash
curl -X POST http://localhost:3001/preview/apply \
  -H "Content-Type: application/json" \
  -d '{"siteId": "abc123", "unifiedDiff": "--- a/src/app/page.tsx\n+++ b/src/app/page.tsx\n..."}'
```

### Deploy Changes
```bash
curl -X POST http://localhost:3001/preview/deploy \
  -H "Content-Type: application/json" \
  -d '{"siteId": "abc123", "mode": "pr", "title": "AI: Update colors"}'
```
