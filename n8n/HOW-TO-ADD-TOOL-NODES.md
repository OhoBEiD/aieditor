# How to Add Tool Nodes to Your AI Agent

I can see you already have the AI Agent with 3 tools set up! Now you need to add the handler nodes for each tool.

## What You're Adding

Each tool needs a **workflow** that:
1. Prepares the data
2. Builds the API request
3. Calls GitHub API
4. Formats the response for AI

---

## Step-by-Step Instructions

### Step 1: Import the Tool Nodes

1. In n8n, click the **"..."** menu (top right)
2. Select **"Import from File"**
3. Choose **`COMPLETE-AI-AGENT-TOOLS.json`**
4. Click **"Import"**

This will add 12 nodes (4 nodes per tool × 3 tools).

### Step 2: Connect Tool_search_code

Your **Tool_search_code** node needs to call a workflow. Here's how:

1. Click on **Tool_search_code** node
2. In the settings panel, find **"Workflow"** field
3. Create a new workflow or select existing
4. In that workflow, add these nodes in order:
   - **Search Code - Prepare**
   - **Search Code - Build Query**
   - **Search Code - API Call**
   - **Search Code - Format Response**

5. Connect them sequentially
6. The workflow should **start** with "Search Code - Prepare"
7. The workflow should **end** with "Search Code - Format Response"

**OR** use the simpler approach below ↓

---

## Simpler Approach: Use Code Nodes Directly

Instead of separate workflows, put the code directly in each tool:

### Tool 1: search_code

Click on **Tool_search_code** → Settings → Tool Code

Paste this complete code:

```javascript
// AI Agent Tool: search_code
const pattern = $input.item.json.pattern;
const fileTypes = $input.item.json.fileTypes || [];

// Get site info from parent workflow context
const site = $('Merge Files').item.json.site;
const owner = site.owner;
const repo = site.repo;

// Build file extension filter
let fileExtension = '';
if (fileTypes.length > 0) {
  fileExtension = fileTypes.map(t => `+extension:${t}`).join('');
}

// Build GitHub search query
const query = `${pattern}+repo:${owner}/${repo}${fileExtension}`;

// Call GitHub API
const response = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=50`, {
  headers: {
    'Authorization': `Bearer ${$env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }
});

const data = await response.json();

// Format results
if (!data || !data.items) {
  return {
    json: {
      success: true,
      matches: [],
      message: 'No matches found'
    }
  };
}

const matches = data.items.map(item => ({
  path: item.path,
  repository: item.repository?.full_name || 'unknown',
  url: item.html_url
}));

return {
  json: {
    success: true,
    matches: matches,
    total: data.total_count || 0,
    message: `Found ${matches.length} matches across ${matches.length} files`,
    files: matches.map(m => m.path)
  }
};
```

### Tool 2: read_file

Click on **Tool_read_file** → Settings → Tool Code

Paste this:

```javascript
// AI Agent Tool: read_file
const filePath = $input.item.json.filePath;

// Get site info from parent workflow context
const site = $('Merge Files').item.json.site;
const owner = site.owner;
const repo = site.repo;
const branch = site.default_branch || 'main';

// Build GitHub file URL
const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

// Fetch file contents
const response = await fetch(url, {
  headers: {
    'Authorization': `Bearer ${$env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.raw',
    'X-GitHub-Api-Version': '2022-11-28'
  }
});

const content = await response.text();

// Add line numbers
const lines = content.split('\n');
const numberedContent = lines.map((line, i) => `${i + 1}\t${line}`).join('\n');

return {
  json: {
    success: true,
    filePath: filePath,
    content: numberedContent,
    rawContent: content,
    lines: lines.length,
    message: `Successfully read ${filePath} (${lines.length} lines)`
  }
};
```

### Tool 3: list_files

Click on **Tool_list_files** → Settings → Tool Code

Paste this:

```javascript
// AI Agent Tool: list_files
const pattern = $input.item.json.pattern;

// Get site info from parent workflow context
const site = $('Merge Files').item.json.site;
const owner = site.owner;
const repo = site.repo;

// Convert glob pattern to GitHub search query
let searchQuery = '';

// Extract directory path: "src/**/*.css" -> "path:src"
const pathMatch = pattern.match(/^([^*]+)/);
if (pathMatch && pathMatch[1]) {
  const cleanPath = pathMatch[1].replace(/\/$/, '');
  if (cleanPath) {
    searchQuery += `path:${cleanPath}`;
  }
}

// Extract file extension: "**/*.css" -> "extension:css"
const extMatch = pattern.match(/\*\.(\w+)$/);
if (extMatch) {
  if (searchQuery) searchQuery += '+';
  searchQuery += `extension:${extMatch[1]}`;
}

// If no specific pattern, search all
if (!searchQuery) {
  searchQuery = 'path:/';
}

// Build full query
const query = `repo:${owner}/${repo}+${searchQuery}`;

// Call GitHub API
const response = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=50`, {
  headers: {
    'Authorization': `Bearer ${$env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }
});

const data = await response.json();

// Format results
if (!data || !data.items) {
  return {
    json: {
      success: true,
      files: [],
      message: `No files matching pattern '${pattern}'`
    }
  };
}

const files = data.items.map(item => ({
  path: item.path,
  name: item.name,
  size: item.size || 0,
  url: item.html_url
}));

return {
  json: {
    success: true,
    files: files,
    total: files.length,
    pattern: pattern,
    message: `Found ${files.length} files matching '${pattern}'`,
    paths: files.map(f => f.path)
  }
};
```

---

## Step 3: Set Environment Variable

Your tools need a GitHub token. Add it to n8n:

1. Go to **Settings** → **Environment Variables**
2. Add variable:
   - **Name:** `GITHUB_TOKEN`
   - **Value:** Your GitHub Personal Access Token

**To create a GitHub token:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo` (all)
4. Copy the token
5. Paste into n8n environment variable

---

## Step 4: Test the Tools

### Test 1: Test search_code

In n8n, manually execute the workflow with test data:

```json
{
  "pattern": "cyan",
  "fileTypes": ["tsx", "css"]
}
```

Expected output:
```json
{
  "success": true,
  "matches": [...],
  "message": "Found X matches across Y files"
}
```

### Test 2: Test read_file

Test data:
```json
{
  "filePath": "src/app/page.tsx"
}
```

Expected output:
```json
{
  "success": true,
  "filePath": "src/app/page.tsx",
  "content": "1\timport ...\n2\texport default...",
  "lines": 50
}
```

### Test 3: Test list_files

Test data:
```json
{
  "pattern": "**/*.css"
}
```

Expected output:
```json
{
  "success": true,
  "files": [...],
  "total": 3,
  "paths": ["src/app/globals.css", ...]
}
```

---

## Step 5: Test the Full Flow

Now test the complete AI Agent:

1. Send a message: **"search for the word 'cyan' in all files"**
2. Watch the execution
3. You should see the AI Agent call `search_code` tool
4. The tool should return results
5. The AI should process and respond

**Expected behavior:**
```
User: "search for 'cyan'"
  ↓
AI thinks: I should use search_code tool
  ↓
[Calls search_code("cyan")]
  ↓
Tool returns: Found in page.tsx, globals.css
  ↓
AI responds: "I found 'cyan' in 2 files: page.tsx and globals.css"
```

---

## Troubleshooting

### "Cannot access $('Merge Files')"

**Fix:** The tool code needs access to the parent workflow context. Make sure:
1. The tools are called FROM the main workflow
2. The "Merge Files" node exists in the main workflow
3. The AI Agent is connected after "Merge Files"

### "GitHub API returns 401 Unauthorized"

**Fix:** Check your GitHub token:
1. Token is valid and not expired
2. Token has `repo` scope
3. Environment variable `GITHUB_TOKEN` is set correctly

### "AI not calling tools"

**Fix:** Check the AI Agent system message:
1. It should mention the 3 tools
2. It should encourage using tools
3. It should give examples of when to use each tool

---

## What Happens Next

Once all 3 tools are working:

1. **User:** "change colors to orange"
2. **AI calls:** search_code("cyan")
3. **Tool returns:** Found in page.tsx, globals.css
4. **AI calls:** read_file("src/app/globals.css")
5. **Tool returns:** Full file contents
6. **AI calls:** read_file("src/app/page.tsx")
7. **Tool returns:** Full file contents
8. **AI generates:** Complete diffs for both files
9. **Result:** ✅ Perfect! All colors changed!

Your AI can now explore the codebase like Cursor! 🚀
