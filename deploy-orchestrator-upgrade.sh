#!/bin/bash

# Orchestrator Upgrade Deployment Script
# This script deploys the upgraded orchestrator with 4GB RAM

set -e

echo "=========================================="
echo "  Orchestrator Upgrade Deployment"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "fly-orchestrator/fly.toml" ]; then
    echo "❌ Error: fly-orchestrator/fly.toml not found"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo "📋 Current Configuration:"
echo "  Location: fly-orchestrator/"
grep -A 3 "\[\[vm\]\]" fly-orchestrator/fly.toml | sed 's/^/  /'
echo ""

echo "🔍 Checking Fly.io CLI..."
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found. Please install it first:"
    echo "   https://fly.io/docs/hands-on/install-flyctl/"
    exit 1
fi

echo "✅ Fly CLI found: $(fly version)"
echo ""

echo "🔐 Checking Fly.io authentication..."
if ! fly auth whoami &> /dev/null; then
    echo "❌ Not authenticated with Fly.io"
    echo "Please run: fly auth login"
    exit 1
fi

echo "✅ Authenticated as: $(fly auth whoami)"
echo ""

echo "📦 Navigating to orchestrator directory..."
cd fly-orchestrator

echo "🔍 Checking for existing app..."
if fly status &> /dev/null; then
    echo "✅ App 'preview-orchestrator' found"
    echo ""
    echo "📊 Current status:"
    fly status | head -n 15
    echo ""
else
    echo "❌ App 'preview-orchestrator' not found"
    echo "Please create it first with: fly launch"
    exit 1
fi

echo "⚠️  WARNING: This will upgrade the orchestrator to:"
echo "  • RAM: 4096MB (4GB) - previously 1024MB"
echo "  • CPUs: 2 - previously 1"
echo "  • Cost: ~$22.80/month (increase of ~$17/month)"
echo ""
echo "This upgrade is necessary to fix preview loading issues."
echo ""

read -p "Do you want to proceed with the deployment? (yes/no): " -r
echo
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

echo ""
echo "🚀 Starting deployment..."
echo ""

# Deploy
if fly deploy --ha=false; then
    echo ""
    echo "=========================================="
    echo "  ✅ Deployment Successful!"
    echo "=========================================="
    echo ""
    echo "📊 New Configuration:"
    echo "  RAM: 4GB"
    echo "  CPUs: 2"
    echo "  Health Check Timeout: 90s"
    echo "  Node Memory Limit: 2GB per process"
    echo ""
    echo "📝 Next Steps:"
    echo "  1. Monitor logs: fly logs"
    echo "  2. Check status: fly status"
    echo "  3. Test preview: Send a message to the AI editor"
    echo "  4. Monitor memory: fly vm status"
    echo ""
    echo "📖 For troubleshooting, see: ../ORCHESTRATOR-UPGRADE-GUIDE.md"
    echo ""
else
    echo ""
    echo "=========================================="
    echo "  ❌ Deployment Failed"
    echo "=========================================="
    echo ""
    echo "Please check the error messages above and try again."
    echo "For help, see: ../ORCHESTRATOR-UPGRADE-GUIDE.md"
    echo ""
    exit 1
fi

# Show final status
echo "📊 Final Status:"
fly status

echo ""
echo "🔍 Tailing logs (Ctrl+C to exit)..."
echo ""
sleep 2
fly logs
