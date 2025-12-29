# Agentic Workflow Setup - Making AI Search Like Cursor

## The Problem

Your current AI just generates diffs from the FILES PROVIDED. It can't:
- Search for additional files
- Grep for patterns
- Read files not in the initial context
- Explore the codebase systematically

**Result:** Incomplete changes, warnings like "check globals.css", guessing instead of searching.

## The Solution

Convert your AI node from a simple LLM call to an **AGENT** with tools.

---

## Option 1: Use n8n AI Agent (Recommended)

### Step 1: Replace "AI Plan" Node

1. Delete your current "AI Plan" node (or keep it disabled)
2. Add **"AI Agent"** node from n8n (under AI category)
3. Configure:
   - **Model:** Connect your Anthropic Claude node
   - **Prompt Type:** "Define below"
   - **System Message:** Paste from `AGENTIC-SYSTEM-PROMPT.txt`

### Step 2: Add Tools to Agent

The AI Agent needs these tools:

#### Tool 1: Execute Command
```javascript
// Tool: execute_command
// Description: Run terminal commands to search files
{
  name: "execute_command",
  description: "Execute a shell command to search files, grep patterns, or list directories",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Shell command to execute (e.g., 'grep -r pattern src/')"
      }
    },
    required: ["command"]
  }
}
```

**Implementation:**
- Add "Execute Command" tool node to AI Agent
- Connect to "HTTP Request" node that calls your file system API
- Or use n8n's built-in Code node to execute safely

#### Tool 2: Read File
```javascript
// Tool: read_file
// Description: Read contents of a specific file
{
  name: "read_file",
  description: "Read the full contents of a file at the given path",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative file path from repository root (e.g., 'src/app/globals.css')"
      }
    },
    required: ["path"]
  }
}
```

**Implementation:**
- Add "Read File" tool node
- Connect to GitHub API or your file system
- Return file contents to agent

#### Tool 3: Search Files
```javascript
// Tool: search_files
// Description: Search for files by pattern
{
  name: "search_files",
  description: "Find files matching a glob pattern",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Glob pattern (e.g., '**/*.css', 'src/**/*.tsx')"
      }
    },
    required: ["pattern"]
  }
}
```

### Step 3: Create Tool Handler Nodes

For each tool, create a handler:

**HTTP Request Node (for execute_command):**
```
URL: https://your-api.com/execute
Method: POST
Body: {
  "repo": "{{ $json.site.repo }}",
  "command": "{{ $json.command }}"
}
```

**HTTP Request Node (for read_file):**
```
URL: https://api.github.com/repos/{{ $json.site.owner }}/{{ $json.site.repo }}/contents/{{ $json.path }}
Headers:
  Authorization: Bearer {{ $env.GITHUB_TOKEN }}
  Accept: application/vnd.github.raw
```

### Step 4: Connect Tool Outputs Back to Agent

The AI Agent will:
1. Call tools multiple times
2. Analyze results
3. Call more tools if needed
4. Finally generate the complete JSON output

---

## Option 2: Manual Multi-Step Workflow (Simpler, But Limited)

If you can't use AI Agent node, create a multi-phase workflow:

### Phase 1: Search Planning
- AI generates search queries
- Outputs: list of grep/find commands

### Phase 2: Execute Searches
- Loop through commands
- Execute each via HTTP Request
- Collect results

### Phase 3: File Reading
- AI receives search results
- Requests specific files to read
- Files are fetched via GitHub API

### Phase 4: Final Diff Generation
- AI has all context
- Generates complete diffs
- No warnings/guessing needed

---

## Option 3: Enhanced Context Pre-Loading (Quick Fix)

If you can't change the workflow structure right now, improve what files are loaded:

### Update "Build Context" Node

```javascript
const inp = $('Validate Input').item.json;
const siteArr = $input.first().json;
const site = Array.isArray(siteArr) ? siteArr[0] : siteArr;

// Parse user message to detect what they're asking for
const message = inp.message.toLowerCase();

// Default files
let filesToFetch = [
  'src/app/page.tsx',
  'src/app/layout.tsx'
];

// Smart file detection based on keywords
if (message.includes('color') || message.includes('gradient') || message.includes('theme')) {
  filesToFetch.push('src/app/globals.css');
  filesToFetch.push('tailwind.config.js');
  filesToFetch.push('tailwind.config.ts');
}

if (message.includes('button') || message.includes('component')) {
  filesToFetch.push('src/components/**/*.tsx');
}

if (message.includes('layout') || message.includes('navbar') || message.includes('header')) {
  filesToFetch.push('src/app/layout.tsx');
  filesToFetch.push('src/components/Navbar.tsx');
  filesToFetch.push('src/components/Header.tsx');
}

if (message.includes('animation') || message.includes('motion')) {
  filesToFetch.push('src/app/globals.css');
  filesToFetch.push('tailwind.config.js');
}

// Always include config files for comprehensive changes
if (message.includes('redesign') || message.includes('change all') || message.includes('entire')) {
  filesToFetch.push('src/app/globals.css');
  filesToFetch.push('tailwind.config.js');
  filesToFetch.push('src/components/**/*.tsx');
}

return [{
  json: {
    ...inp,
    site: {
      id: site.id,
      name: site.name,
      repo_url: site.repo_url,
      default_branch: site.default_branch || 'main',
      stack: site.stack || 'unknown',
      allowedPaths: ['**/*', 'src/**', 'public/**'],
      owner: site.repo_url.match(/github\\.com\\/([^/]+)\\/([^/]+)/)?.[1],
      repo: site.repo_url.match(/github\\.com\\/([^/]+)\\/([^/]+)/)?.[2]?.replace(/\\.git$/, '')
    },
    fileContents: {},
    filesToFetch: [...new Set(filesToFetch)], // Remove duplicates
    sessionId: inp.conversationId
  }
}];
```

This at least pre-loads more files based on keywords in the user's message.

---

## Recommendation

**Short term (today):**
Use Option 3 - Enhanced Context Pre-Loading
- Update build-context-fixed.js with smart file detection
- This will catch 80% of cases

**Medium term (this week):**
Implement Option 2 - Multi-Step Workflow
- Add grep/search phase before diff generation
- AI can request additional files

**Long term (ideal):**
Implement Option 1 - True AI Agent
- AI has tools to search, read, explore
- Works exactly like Cursor/Windsurf
- Most reliable and complete

---

## Next Steps

1. Choose which option to implement
2. I'll create the code/workflow for you
3. Test with complex changes (colors, layouts, etc.)
4. Iterate until it's as good as Cursor

**Which option do you want to start with?**
