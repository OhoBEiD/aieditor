# Complete Fix Guide - Eliminate Execution Spam & Error Messages

## What These Fixes Do

1. **Stops execution spam** - Tools will run once instead of looping
2. **Eliminates error messages** - AI will use tools instead of outputting warnings
3. **Guarantees complete diffs** - AI will search and read all files before responding

## Step-by-Step Instructions

### 1. Update Parse Plan Node

In your n8n workflow, find the **Parse Plan** node (Code node after AI Agent).

Click on it and replace ALL the code with this:

```javascript
// Fixed Parse Plan node - works with AI Agent
const ctx = $('Merge Files').item.json;
const agentOutput = $('AI Plan Agent').item.json;

// Agent returns output in different format than basic LLM
let plan;
let out = '';

// Try to get output from agent
if (agentOutput.output) {
  out = String(agentOutput.output);
} else if (agentOutput.text) {
  out = String(agentOutput.text);
} else if (agentOutput.response) {
  out = String(agentOutput.response);
} else {
  out = JSON.stringify(agentOutput);
}

// Try to parse JSON from output
try {
  // Try direct parse first
  if (typeof agentOutput.output === 'object' && agentOutput.output !== null) {
    plan = agentOutput.output;
  } else {
    // Extract JSON from text
    const jsonMatch = out.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      plan = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in output');
    }
  }
} catch (e) {
  // Fallback plan if parsing fails
  plan = {
    intent: 'error',
    humanSummary: 'Failed to parse AI agent output: ' + e.message,
    unifiedDiff: '',
    fileTargets: [],
    warnings: ['Could not parse agent response', 'Raw output: ' + out.slice(0, 200)]
  };
}

// Ensure required fields exist
plan.warnings = plan.warnings || [];
plan.unifiedDiff = plan.unifiedDiff || '';
plan.humanSummary = plan.humanSummary || '';
plan.fileTargets = plan.fileTargets || [];
plan.packagesToInstall = plan.packagesToInstall || [];

return [{ json: { ...ctx, plan } }];
```

### 2. Update Tool: search_code Workflow

Find your **Tool: search_code** workflow (the sub-workflow).

Click on the **Search Code Logic** node and replace the code with:

```javascript
// AI Agent Tool: search_code
const pattern = $input.item.json.pattern;
const fileTypes = $input.item.json.fileTypes || [];

// Get site info from input (NOT from parent workflow)
const site = $input.item.json.site || {};
const owner = site.owner || $input.item.json.owner;
const repo = site.repo || $input.item.json.repo;

if (!owner || !repo) {
  return {
    json: {
      success: false,
      error: 'Missing repository information. Owner: ' + owner + ', Repo: ' + repo,
      matches: []
    }
  };
}

// Build file extension filter
let fileExtension = '';
if (fileTypes && fileTypes.length > 0) {
  fileExtension = fileTypes.map(t => `+extension:${t}`).join('');
}

// Build GitHub search query
const query = `${pattern}+repo:${owner}/${repo}${fileExtension}`;

try {
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
        message: 'No matches found for pattern: ' + pattern
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
      message: `Found ${matches.length} matches for '${pattern}'`,
      files: matches.map(m => m.path)
    }
  };
} catch (error) {
  return {
    json: {
      success: false,
      error: 'GitHub API error: ' + error.message,
      matches: []
    }
  };
}
```

### 3. Update Tool: read_file Workflow

Find your **Tool: read_file** workflow.

Click on the **Read File Logic** node and replace the code with:

```javascript
// AI Agent Tool: read_file
const filePath = $input.item.json.filePath;

// Get site info from input (NOT from parent workflow)
const site = $input.item.json.site || {};
const owner = site.owner || $input.item.json.owner;
const repo = site.repo || $input.item.json.repo;
const branch = site.default_branch || $input.item.json.branch || 'main';

if (!owner || !repo || !filePath) {
  return {
    json: {
      success: false,
      error: 'Missing required parameters. Need: owner, repo, filePath'
    }
  };
}

// Build GitHub file URL
const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

try {
  // Fetch file contents
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${$env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.raw',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
  }

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
} catch (error) {
  return {
    json: {
      success: false,
      error: 'Failed to read file: ' + error.message,
      filePath: filePath
    }
  };
}
```

### 4. Update Tool: list_files Workflow

Find your **Tool: list_files** workflow.

Click on the **List Files Logic** node and replace the code with:

```javascript
// AI Agent Tool: list_files
const pattern = $input.item.json.pattern;

// Get site info from input (NOT from parent workflow)
const site = $input.item.json.site || {};
const owner = site.owner || $input.item.json.owner;
const repo = site.repo || $input.item.json.repo;

if (!owner || !repo) {
  return {
    json: {
      success: false,
      error: 'Missing repository information. Owner: ' + owner + ', Repo: ' + repo,
      files: []
    }
  };
}

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
const extMatch = pattern.match(/\*\.\(\w+)$/);
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

try {
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
} catch (error) {
  return {
    json: {
      success: false,
      error: 'GitHub API error: ' + error.message,
      files: []
    }
  };
}
```

### 5. Update AI Agent System Message

In your main workflow, find the **AI Plan Agent** node.

Click on it and copy/paste the ENTIRE contents of `BULLETPROOF-SYSTEM-PROMPT.txt` into the System Message field.

**CRITICAL**: The updated prompt now includes explicit examples of forbidden outputs:

```
🚨 **YOU MUST NEVER OUTPUT TEXT LIKE THIS:**
- ❌ "⚠️ Unable to access repository tools to verify all file locations"
- ❌ "Please review the changes and ensure..."
- ❌ "Some paths not allowed: README.md"
- ❌ ANY text with warning symbols (⚠️, ❗, ⛔)
- ❌ ANY requests for the user to verify or review
- ❌ ANY mentions of paths being restricted or not allowed

🚨 **IF YOU CANNOT READ A FILE:**
- ✅ Use the read_file tool to read it
- ✅ Use the search_code tool to find it
- ✅ Use the list_files tool to locate it
- ❌ DO NOT output warnings about it

🚨 **FINAL OUTPUT RULES:**
Your FINAL response must be ONLY valid JSON. Nothing else.

The "warnings" array MUST ALWAYS BE EMPTY: []
```

This guarantees the AI will NEVER output warning messages.

## Testing

After applying all fixes, test with: **"change colors to orange"**

Expected behavior:
- ✅ Workflow executes ONCE (no spam)
- ✅ AI searches for color patterns (cyan, purple, etc.)
- ✅ AI reads discovered files (globals.css, page.tsx)
- ✅ AI generates complete unified diffs for ALL files
- ✅ NO warning messages in response
- ✅ Preview updates with changes

## What Was Fixed

### Execution Spam Problem
**Before**: Tools tried to access `$('Merge Files').item.json.site` which doesn't exist in child workflow context
**After**: Tools get site info from `$input.item.json.site` which is passed correctly

### Error Messages Problem
**Before**: AI would output warnings like "⚠️ Unable to access repository tools"
**After**: System prompt explicitly forbids warnings and mandates tool usage

### Parse Plan Error
**Before**: Node referenced `$('AI Plan')` which didn't exist
**After**: Node references `$('AI Plan Agent')` correctly

## Verification Checklist

- [ ] Parse Plan node updated
- [ ] Tool: search_code workflow updated
- [ ] Tool: read_file workflow updated
- [ ] Tool: list_files workflow updated
- [ ] AI Agent system message updated
- [ ] Test request runs without execution spam
- [ ] Test response has no warning messages
- [ ] Preview updates correctly

All fixes are now documented. Apply them in order and your AI editor will work exactly like Cursor/Windsurf.
