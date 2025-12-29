#!/bin/bash
# Deploy n8n to Fly.io

set -e

echo "🚀 Deploying n8n to Fly.io..."

# Check if flyctl is installed
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found. Install with: brew install flyctl"
    exit 1
fi

# Check if logged in
if ! fly auth whoami &> /dev/null; then
    echo "⚠️  Not logged in. Running: fly auth login"
    fly auth login
fi

# Create volume for data persistence (if not exists)
echo "📦 Creating volume..."
fly volumes create n8n_data --region cdg --size 1 --yes 2>/dev/null || echo "Volume already exists"

# Launch the app (first time)
if ! fly apps list | grep -q "n8n-ai-editor"; then
    echo "🆕 Creating app..."
    fly launch --config fly.toml --no-deploy --copy-config --yes
fi

# Set secrets
echo "🔐 Setting secrets..."
fly secrets set N8N_ENCRYPTION_KEY=$(openssl rand -hex 32) --app n8n-ai-editor 2>/dev/null || true

# Deploy
echo "🚀 Deploying..."
fly deploy --app n8n-ai-editor

echo ""
echo "✅ n8n deployed successfully!"
echo ""
echo "📌 Access your n8n at: https://n8n-ai-editor.fly.dev"
echo ""
echo "⚠️  Don't forget to set your GitHub token:"
echo "   fly secrets set GITHUB_TOKEN=ghp_your_token --app n8n-ai-editor"
echo ""
echo "📝 Next steps:"
echo "   1. Open https://n8n-ai-editor.fly.dev"
echo "   2. Create an account"
echo "   3. Import your workflow JSON"
echo "   4. Update webhook URL in your app to: https://n8n-ai-editor.fly.dev/webhook/agent/edit-ui"
