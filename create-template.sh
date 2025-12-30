#!/bin/bash
set -e

# 1. Create a temporary directory for the template
mkdir -p template-temp
cd template-temp

# 2. Initialize a fresh Next.js app (non-interactive)
npx create-next-app@latest automate-starter-template \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-npm \
  --no-git # We init git manually to avoid nesting

cd automate-starter-template

# 3. Initialize Git
git init
git add .
git commit -m "Initial commit for automate-starter-template"

echo "✅ Local template created in 'template-temp/automate-starter-template'"
echo "--------------------------------------------------------"
echo "👉 NEXT STEPS (Run these commands manually if the script below fails):"
echo "1. Go to https://github.com/new"
echo "2. Repository name: automate-starter-template"
echo "3. Visibility: Public (recommended) or Private"
echo "4. Create repository"
echo "5. Run: git remote add origin https://github.com/OhoBEiD/automate-starter-template.git"
echo "6. Run: git push -u origin main"
echo "7. Go to Settings -> General -> Check 'Template repository'"
echo "--------------------------------------------------------"

# 4. Try to push automatically if gh cli is installed and authenticated
if command -v gh &> /dev/null; then
    echo "Attempting to create repo on GitHub using gh cli..."
    gh repo create OhoBEiD/automate-starter-template --public --source=. --push
    echo "✅ Repo created and pushed!"
    echo "Opening settings page..."
    open "https://github.com/OhoBEiD/automate-starter-template/settings"
else
    echo "❌ 'gh' CLI not found. Please follow the manual steps above to push to GitHub."
fi
