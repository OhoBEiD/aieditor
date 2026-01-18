const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V23.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Adding grep_search tool for token-efficient search...\n');

// Find the search_files node to place grep_search near it
const searchFilesNode = workflow.nodes.find(n => n.name === 'search_files');
const position = searchFilesNode ? searchFilesNode.position : [30320, 8880];

// Create the new grep_search tool
const grepSearchNode = {
  "parameters": {
    "name": "grep_search",
    "description": "Search for text patterns in files and return ONLY matching lines with file paths. Much faster than read_file for finding text. Input: search text/pattern (e.g., 'omar obeid' or 'function handleClick')",
    "jsCode": `const rawInput = $fromAI('query');
const searchText = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

if (!searchText) return 'Error: Search text required';

const ctx = $('Merge Files')?.item?.json || {};
const owner = ctx.owner;
const repo = ctx.repo;
const branch = ctx.branch || 'main';
const githubToken = ctx.githubToken;
const siteId = ctx.site?.id;
const requestId = ctx.requestId || 'req';
const siteUuid = ctx.site?.uuid || siteId;

if (!owner || !repo || !githubToken) return 'Error: No repository context';

// Emit progress
try { await this.helpers.httpRequest({ method: 'POST', url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps', headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ request_id: requestId, site_id: siteUuid, step_number: Date.now() % 100000, tool_name: 'grep_search', status: 'running', message: 'Searching: ' + searchText.substring(0, 30), details: { query: searchText } }), timeout: 3000 }); } catch(e) {}

try {
  // Use GitHub's code search API with 'in:file' to search file contents
  const query = encodeURIComponent(searchText + ' repo:' + owner + '/' + repo);
  const response = await this.helpers.httpRequest({
    method: 'GET',
    url: 'https://api.github.com/search/code?q=' + query + '&per_page=20',
    headers: {
      'Authorization': 'Bearer ' + githubToken,
      'Accept': 'application/vnd.github.text-match+json'
    },
    timeout: 15000,
    json: true
  });

  if (!response.items || response.items.length === 0) {
    return 'No matches found for: ' + searchText;
  }

  // Format results as file:line format (like grep output)
  let results = [];
  for (const item of response.items.slice(0, 10)) {
    const filePath = item.path;

    // Get text matches if available
    if (item.text_matches && item.text_matches.length > 0) {
      for (const match of item.text_matches.slice(0, 3)) {
        const fragment = match.fragment || '';
        // Extract just the line containing the match
        const lines = fragment.split('\\n');
        for (const line of lines) {
          if (line.toLowerCase().includes(searchText.toLowerCase())) {
            results.push(filePath + ': ' + line.trim());
            if (results.length >= 20) break;
          }
        }
        if (results.length >= 20) break;
      }
    } else {
      // No text matches, just show file path
      results.push(filePath + ': (match found in file)');
    }
  }

  if (results.length === 0) {
    return 'Found in ' + response.items.length + ' files but no line previews available. Files: ' + response.items.slice(0, 5).map(i => i.path).join(', ');
  }

  return results.join('\\n');
} catch (e) {
  return 'Error: ' + e.message;
}`
  },
  "id": "grep-search-001",
  "name": "grep_search",
  "type": "@n8n/n8n-nodes-langchain.toolCode",
  "typeVersion": 1,
  "position": [position[0] + 160, position[1]]
};

// Add the node
workflow.nodes.push(grepSearchNode);

// Connect grep_search to both executors (same as search_files)
workflow.connections.grep_search = {
  "ai_tool": [
    [
      {
        "node": "Complex Executor",
        "type": "ai_tool",
        "index": 0
      },
      {
        "node": "Simple Executor",
        "type": "ai_tool",
        "index": 0
      }
    ]
  ]
};

// Update system prompts to mention grep_search
const complexExecutor = workflow.nodes.find(n => n.name === 'Complex Executor');
if (complexExecutor) {
  console.log('✅ Updating Complex Executor to mention grep_search');
  const currentSystemMsg = complexExecutor.parameters.options.systemMessage;
  const newSystemMsg = currentSystemMsg.replace(
    '⚠️ DO NOT search_files for non-code queries',
    '⚠️ DO NOT search_files for non-code queries\\n⚠️ Use grep_search instead of read_file when looking for specific text'
  );
  complexExecutor.parameters.options.systemMessage = newSystemMsg;
}

const simpleExecutor = workflow.nodes.find(n => n.name === 'Simple Executor');
if (simpleExecutor) {
  console.log('✅ Updating Simple Executor to mention grep_search');
  const currentSystemMsg = simpleExecutor.parameters.options.systemMessage;
  const newSystemMsg = currentSystemMsg.replace(
    '⚠️ FILES IN CONTEXT',
    '⚠️ Use grep_search to find text quickly\\n⚠️ FILES IN CONTEXT'
  );
  simpleExecutor.parameters.options.systemMessage = newSystemMsg;
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V24.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ Created V24 with grep_search tool!');
console.log('📁 Saved to:', outputPath);
console.log('\n🔍 New tool: grep_search');
console.log('  • Searches for text patterns across files');
console.log('  • Returns ONLY matching lines (not entire files)');
console.log('  • Saves thousands of tokens!');
console.log('\n💡 Example usage:');
console.log('  User: "Change omar obeid to omars ai"');
console.log('  AI: Uses grep_search("omar obeid") → Gets: src/app/page.tsx: <h1>omar obeid</h1>');
console.log('  AI: Uses str_replace with exact line from grep result');
console.log('\n📊 Token savings:');
console.log('  Before (read_file): 3387 tokens per file read');
console.log('  After (grep_search): ~50 tokens for search results');
console.log('  Savings: 98%+ reduction!');
