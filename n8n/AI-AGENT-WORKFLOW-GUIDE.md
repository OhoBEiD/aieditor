# Complete AI Agent Workflow Setup Guide

## Overview

This guide will help you convert your current workflow to use **AI Agent with Tools**, making it work like Cursor/Windsurf.

---

## Architecture

```
User Request
    ↓
Build Context (prepare initial data)
    ↓
AI Agent (with 3 tools) ←→ Tools loop multiple times
    ├─ search_code
    ├─ read_file
    └─ list_files
    ↓
Parse Plan (extract final JSON)
    ↓
Guardrails
    ↓
Fly Apply Diff
    ↓
Response
```

---

## Step-by-Step Setup

### Step 1: Update Your Workflow Nodes

Open your `fly-edit-ui-workflow-v4.json` in n8n and make these changes:

#### A. Keep These Nodes (No Changes)
- ✅ Webhook
- ✅ Validate Input
- ✅ Fly Start Preview
- ✅ Merge Fly Response
- ✅ Build Context
- ✅ Fetch GitHub Files
- ✅ Merge Files
- ✅ Guardrails
- ✅ Fly Apply Diff
- ✅ Merge Apply
- ✅ Save Request
- ✅ Response

#### B. Replace This Node
- ❌ **DELETE:** "AI Plan" (the current Anthropic Chat node)
- ✅ **ADD:** "AI Agent" node

---

### Step 2: Configure AI Agent Node

1. **Add AI Agent Node**
   - In n8n editor, click **+** after "Merge Files"
   - Search for **"AI Agent"**
   - Add it to canvas

2. **Configure Basic Settings**
   ```
   Name: AI Plan Agent
   Prompt Type: Define below
   Text: {{ $json.message }}
   ```

3. **Connect Model**
   - Add **"Anthropic Chat Model"** node below AI Agent
   - Configure:
     ```
     Model: claude-sonnet-4-5-20250929
     API Key: Your Anthropic API key
     ```
   - Connect this model node to AI Agent's "Model" input

4. **Set System Message**

   Click on AI Agent → Options → System Message, paste this:

   ```
   You are AutoMate, an expert AI code editor with tools to search and analyze codebases.

   **YOUR MISSION:** Search files systematically, then generate complete unified diffs.

   ## AVAILABLE TOOLS

   You have 3 tools to explore the codebase:

   1. **search_code(pattern, fileTypes?, caseSensitive?)**
      - Search for text/patterns across all files
      - Returns: file paths and line numbers with matches
      - Example: search_code("gradient-text") finds all uses of that class

   2. **read_file(filePath)**
      - Read complete contents of a specific file
      - Returns: full file content with line numbers
      - Example: read_file("src/app/globals.css")

   3. **list_files(pattern)**
      - Find files matching glob pattern
      - Returns: list of matching file paths
      - Example: list_files("**/*.css") finds all CSS files

   ## WORKFLOW

   ### Phase 1: UNDERSTAND REQUEST
   Parse what user wants to change (text, colors, layout, etc.)

   ### Phase 2: SEARCH & DISCOVER
   Use tools to find ALL relevant files:

   ```
   // Example: User says "change colors to orange"

   Step 1: Search for current colors
   search_code("cyan")
   search_code("purple")
   search_code("#06b6d4")

   Step 2: Find style files
   list_files("**/*.css")
   list_files("**/tailwind.config.*")

   Step 3: Read discovered files
   read_file("src/app/globals.css")
   read_file("src/app/page.tsx")
   read_file("tailwind.config.js")
   ```

   ### Phase 3: ANALYZE
   Map out which files need changes and exactly what lines

   ### Phase 4: GENERATE DIFFS
   Create unified diffs for EVERY affected file

   ## CRITICAL RULES

   🔴 **NEVER:**
   - Skip searching - always use tools first
   - Guess file locations - verify with list_files
   - Generate partial diffs - include ALL affected files
   - Output warnings like "check globals.css" - READ it yourself

   ✅ **ALWAYS:**
   - Search for ALL occurrences of patterns
   - Read every file before modifying it
   - Generate complete diffs for every affected file
   - Verify changes are comprehensive

   ## OUTPUT FORMAT

   After using tools and analyzing, output JSON:

   ```json
   {
     "intent": "What user wants",
     "fileTargets": [
       {"path": "src/app/page.tsx", "action": "modify"},
       {"path": "src/app/globals.css", "action": "modify"}
     ],
     "humanSummary": "Brief explanation",
     "unifiedDiff": "Complete unified diffs for ALL files (see format below)",
     "packagesToInstall": [],
     "warnings": []
   }
   ```

   ## UNIFIED DIFF FORMAT

   ```
   --- a/path/to/file
   +++ b/path/to/file
   @@ -startLine,count +startLine,count @@
    context line
    context line
   -old line
   +new line
    context line
    context line
   ```

   **Rules:**
   - Include 3 context lines before/after
   - Match source exactly (spaces, tabs, indentation)
   - Proper hunk headers with accurate line counts
   - Multiple files: separate with blank line

   ## CURRENT CONTEXT

   Site: {{ $json.site.name }}
   Repo: {{ $json.site.repo_url }}
   Stack: {{ $json.site.stack }}

   Initial Files Provided:
   {{ Object.entries($json.fileContents).map(([k,v]) => `- ${k} (${v.length} chars)`).join('\n') }}

   Conversation History:
   {{ ($json.conversationHistory || []).slice(-5).map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n') }}

   **Use your tools to discover and read additional files as needed!**

   Output: Valid JSON only (no markdown blocks)
   ```

---

### Step 3: Add Tool Nodes

For each tool, create this setup:

#### Tool 1: search_code

**A. Add "Code Tool" Node**
1. Click **+** on AI Agent
2. Add **"Code Tool"**
3. Configure:
   ```
   Name: search_code
   Description: Search for code patterns across repository files
   ```

**B. Add Tool Schema**
Paste this in the Code Tool's schema:
```json
{
  "name": "search_code",
  "description": "Search for text or regex patterns in code files",
  "parameters": {
    "type": "object",
    "properties": {
      "pattern": {
        "type": "string",
        "description": "Pattern to search for"
      },
      "fileTypes": {
        "type": "array",
        "items": {"type": "string"},
        "description": "File extensions to filter (optional)"
      }
    },
    "required": ["pattern"]
  }
}
```

**C. Add Code Node for Handler**
After the Code Tool, add **"Code"** node with this:
```javascript
// Copy from: tool-handlers/search-code-handler.js
const ctx = $input.first().json;
const pattern = ctx.pattern;
const fileTypes = ctx.fileTypes || [];

const site = $('Build Context').item.json.site;
const owner = site.owner;
const repo = site.repo;

let fileExtension = '';
if (fileTypes && fileTypes.length > 0) {
  fileExtension = '+extension:' + fileTypes.join('+extension:');
}

const query = `${pattern}+repo:${owner}/${repo}${fileExtension}`;

return [{
  json: {
    method: 'GET',
    url: 'https://api.github.com/search/code',
    qs: { q: query, per_page: 100 }
  }
}];
```

**D. Add HTTP Request Node**
```
URL: {{ $json.url }}
Method: {{ $json.method }}
Query Parameters: {{ $json.qs }}
Headers:
  Authorization: Bearer YOUR_GITHUB_TOKEN
  Accept: application/vnd.github+json
```

**E. Format Response**
Add final Code node to format results:
```javascript
const results = $input.first().json;

if (!results.items) {
  return [{ json: { matches: [] } }];
}

const matches = results.items.map(item => ({
  path: item.path,
  repository: item.repository.full_name,
  url: item.html_url
}));

return [{ json: { matches } }];
```

#### Tool 2: read_file

Similar setup - use `tool-handlers/read-file-handler.js`

#### Tool 3: list_files

Similar setup - use `tool-handlers/list-files-handler.js`

---

### Step 4: Connect Everything

```
Merge Files
    ↓
AI Plan Agent
    ├─→ search_code tool → Handler → HTTP → Format → back to Agent
    ├─→ read_file tool → Handler → HTTP → Format → back to Agent
    └─→ list_files tool → Handler → HTTP → Format → back to Agent
    ↓
Parse Plan (extract final JSON from agent output)
    ↓
Guardrails
```

---

### Step 5: Update Parse Plan Node

The AI Agent output format is different. Update Parse Plan:

```javascript
const ctx = $('Merge Files').item.json;
const agentOutput = $('AI Plan Agent').item.json;

// Agent returns text output with JSON
let plan;
const text = String(agentOutput.output || agentOutput.text || '');

// Extract JSON from output
const jsonMatch = text.match(/\{[\s\S]*\}/);
if (jsonMatch) {
  try {
    plan = JSON.parse(jsonMatch[0]);
  } catch (e) {
    plan = {
      intent: 'error',
      humanSummary: 'Failed to parse agent output',
      unifiedDiff: '',
      warnings: ['Agent output was not valid JSON']
    };
  }
} else {
  plan = {
    intent: 'error',
    humanSummary: 'No JSON found in agent output',
    unifiedDiff: '',
    warnings: ['Agent did not return JSON']
  };
}

plan.warnings = plan.warnings || [];
plan.unifiedDiff = plan.unifiedDiff || '';
plan.fileTargets = plan.fileTargets || [];

return [{ json: { ...ctx, plan } }];
```

---

## Testing

### Test Case 1: Simple Change
```
User: "change the main heading to 'Hello World'"

Expected AI behavior:
1. search_code("Demo Site") → finds page.tsx
2. read_file("src/app/page.tsx") → reads content
3. Generates diff with heading change
4. Returns JSON with diff
```

### Test Case 2: Color Change
```
User: "change all colors to orange"

Expected AI behavior:
1. search_code("cyan") → finds page.tsx, globals.css
2. search_code("purple") → finds page.tsx, globals.css
3. list_files("**/*.css") → finds all CSS files
4. read_file("src/app/globals.css")
5. read_file("src/app/page.tsx")
6. read_file("tailwind.config.js")
7. Generates diffs for ALL files
8. Returns complete JSON
```

---

## Troubleshooting

**Issue:** AI isn't calling tools
- Check: Is AI Agent node properly connected to model?
- Check: Are tools properly registered in AI Agent?
- Check: System prompt tells AI to use tools

**Issue:** Tools returning errors
- Check: GitHub token is valid
- Check: Repo owner/name are correct
- Check: Tool handler code is correct

**Issue:** AI calls tools but still incomplete diffs
- Check: System prompt emphasizes reading ALL found files
- Check: Parse Plan extracts unifiedDiff correctly

---

## Next Steps

1. Import this workflow structure into n8n
2. Add your GitHub token
3. Test with simple request
4. Iterate on system prompt if needed
5. Test complex multi-file changes

Your AI will now work EXACTLY like Cursor - it searches, reads, analyzes, then generates complete diffs! 🚀
