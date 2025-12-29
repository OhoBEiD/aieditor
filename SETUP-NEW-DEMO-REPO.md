# Setup New Demo Repository - AI Editor Test

## Step 1: Create New GitHub Repository

1. Go to [GitHub](https://github.com/new)
2. Repository name: `ai-demo-shop`
3. Description: "Demo e-commerce site built by AI Editor"
4. Visibility: **Public** (important for preview to work)
5. **DO NOT** initialize with README, .gitignore, or license
6. Click "Create repository"

## Step 2: Initialize Empty Next.js Project

Instead of creating files manually, we'll let the AI agent do EVERYTHING. Just create an empty repo with a basic package.json:

```bash
# Clone your new empty repository
git clone https://github.com/OhoBEiD/ai-demo-shop.git
cd ai-demo-shop

# Create a minimal package.json for Next.js
cat > package.json << 'EOF'
{
  "name": "ai-demo-shop",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "15.1.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^8",
    "eslint-config-next": "15.1.3",
    "postcss": "^8",
    "tailwindcss": "^3.4.1",
    "typescript": "^5"
  }
}
EOF

# Create basic Next.js config
cat > next.config.ts << 'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
EOF

# Create tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

# Create tailwind config
cat > tailwind.config.ts << 'EOF'
import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
} satisfies Config;
EOF

# Create postcss config
cat > postcss.config.mjs << 'EOF'
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
  },
};

export default config;
EOF

# Create .gitignore
cat > .gitignore << 'EOF'
# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# local env files
.env*.local

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
EOF

# Create src directory with minimal structure
mkdir -p src/app

# Create a minimal starter page
cat > src/app/page.tsx << 'EOF'
export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">AI Demo Shop</h1>
        <p className="text-gray-600">Ready to be built by AI!</p>
      </div>
    </div>
  );
}
EOF

# Create layout
cat > src/app/layout.tsx << 'EOF'
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Demo Shop",
  description: "Built by AI Editor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
EOF

# Create globals.css
cat > src/app/globals.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;
EOF

# Commit and push
git add .
git commit -m "Initial commit - minimal Next.js setup"
git push -u origin main
```

## Step 3: Update AI Editor Configuration

Update the repository URL in your system to use the new repo:

### Option A: Update in the frontend (page.tsx)

In `src/app/page.tsx`, find the `startPreview` function and update:

```typescript
const response = await fetch('https://preview-orchestrator.fly.dev/preview/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        siteId: DEMO_CLIENT_ID,
        repoUrl: 'https://github.com/OhoBEiD/ai-demo-shop.git', // ← UPDATE THIS
        branch: 'main'
    })
});
```

### Option B: Update in Supabase (if you store site config there)

Update the `sites` table to point to the new repository.

## Step 4: Update n8n Workflow Repository Settings

Your n8n workflow needs to know about the new repository. Update these nodes:

### In "Build Context" or "Fetch Repository" node:
- Repository: `OhoBEiD/ai-demo-shop`
- Owner: `OhoBEiD`
- Branch: `main`

### Environment Variables (if using)
If your n8n workflow uses environment variables for the repo:
```
GITHUB_OWNER=OhoBEiD
GITHUB_REPO=ai-demo-shop
DEFAULT_BRANCH=main
```

## Step 5: Test the Complete Workflow

Now you can test having the AI build an entire app from scratch!

### Test 1: Create Components
```
"Create a modern e-commerce header with a logo that says 'AI Shop', navigation menu with Home, Products, About, and Cart links. Use Tailwind CSS for styling."
```

The AI should:
- ✅ Create `src/components/Header.tsx`
- ✅ Add proper TypeScript types
- ✅ Use Tailwind classes
- ✅ Apply changes to workspace
- ✅ Preview shows the new header

### Test 2: Create Pages
```
"Create a products page at /products with a grid of product cards. Each card should have an image placeholder, title, price, and 'Add to Cart' button."
```

The AI should:
- ✅ Create `src/app/products/page.tsx`
- ✅ Create product card component
- ✅ Style with Tailwind
- ✅ You can navigate to /products in preview

### Test 3: Modify Existing Files
```
"Change 'AI Shop' to 'Tech Store' in the header"
```

The AI should:
- ✅ Generate diff for Header.tsx
- ✅ Apply changes
- ✅ Preview updates automatically
- ✅ Changes persist between edits

### Test 4: Create Complex Features
```
"Add a shopping cart feature with add to cart functionality, cart page showing items, and ability to remove items"
```

The AI should:
- ✅ Create multiple files (cart context, cart page, etc.)
- ✅ Update existing components to use cart
- ✅ Generate proper TypeScript interfaces
- ✅ Everything works in preview

## Step 6: Verify Everything Works

1. **Start preview** - should clone new repo successfully
2. **Send first AI command** - AI creates files
3. **Check preview** - new files appear and render
4. **Send second AI command** - AI modifies files
5. **Check preview** - changes appear (after 3 second delay)
6. **Send third AI command** - verify previous changes still there
7. **Accept changes** - commits to GitHub

## Benefits of This Approach

1. ✅ **Clean slate** - No existing file structure to conflict with
2. ✅ **Tests file creation** - Verifies AI can create new files
3. ✅ **Tests file modification** - Verifies AI can edit existing files
4. ✅ **Tests persistence** - Verifies changes survive between edits
5. ✅ **Real-world scenario** - Building an app from scratch like real users would
6. ✅ **Easy debugging** - Can see exactly what AI created vs what was there before

## Troubleshooting

### If AI can't create files:
- Check that n8n workflow has the "create_file" tool enabled
- Verify workspace permissions allow file creation
- Check orchestrator logs for permission errors

### If changes don't persist:
- Verify the fly-orchestrator fix is deployed
- Check that `git status --porcelain` detects changes
- Look for "preserving uncommitted changes" in logs

### If preview doesn't update:
- Wait the full 3 seconds for dev server rebuild
- Check dev server is running in orchestrator logs
- Hard refresh browser (Cmd+Shift+R)

## Next Steps After Success

Once this works, you can:
1. Build increasingly complex features
2. Test AI's ability to understand context across multiple files
3. Create a full production e-commerce site entirely via AI
4. Deploy to production with one click

---

**Ready to create the future of AI-powered development!** 🚀
