const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V24.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Improving grep_search with smart case-insensitive search...\\n');

// Find and update grep_search tool
const grepSearchNode = workflow.nodes.find(n => n.name === 'grep_search');
if (grepSearchNode) {
  console.log('✅ Updating grep_search with smarter search algorithm');

  grepSearchNode.parameters.jsCode = `const rawInput = $fromAI('query');
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
  // Smart search: Try multiple strategies
  const strategies = [
    // Strategy 1: Exact phrase search
    searchText + ' repo:' + owner + '/' + repo,
    // Strategy 2: Individual words (for multi-word searches)
    searchText.split(' ').filter(w => w.length > 2).join(' ') + ' repo:' + owner + '/' + repo,
    // Strategy 3: Quoted exact match
    '"' + searchText + '" repo:' + owner + '/' + repo
  ];

  let response = null;
  let usedStrategy = '';

  // Try strategies in order until we get results
  for (const query of strategies) {
    try {
      const attemptResponse = await this.helpers.httpRequest({
        method: 'GET',
        url: 'https://api.github.com/search/code?q=' + encodeURIComponent(query) + '&per_page=30',
        headers: {
          'Authorization': 'Bearer ' + githubToken,
          'Accept': 'application/vnd.github.text-match+json'
        },
        timeout: 15000,
        json: true
      });

      if (attemptResponse.items && attemptResponse.items.length > 0) {
        response = attemptResponse;
        usedStrategy = query;
        break;
      }
    } catch (e) {
      // Continue to next strategy
      continue;
    }
  }

  if (!response || !response.items || response.items.length === 0) {
    return 'No matches found for: ' + searchText + '. Try searching for individual words or check spelling.';
  }

  // Smart matching with relevance scoring
  const searchLower = searchText.toLowerCase();
  const resultsWithScore = [];

  for (const item of response.items.slice(0, 20)) {
    const filePath = item.path;

    // Get text matches if available
    if (item.text_matches && item.text_matches.length > 0) {
      for (const match of item.text_matches.slice(0, 5)) {
        const fragment = match.fragment || '';
        const lines = fragment.split('\\n');

        for (const line of lines) {
          const lineLower = line.toLowerCase();

          // Calculate relevance score
          let score = 0;

          // Exact match (case-insensitive) gets highest score
          if (lineLower.includes(searchLower)) {
            score = 100;
          }
          // Partial match - all words present
          else if (searchText.split(' ').every(word => lineLower.includes(word.toLowerCase()))) {
            score = 80;
          }
          // Any word matches
          else if (searchText.split(' ').some(word => word.length > 2 && lineLower.includes(word.toLowerCase()))) {
            score = 50;
          }

          if (score > 0) {
            resultsWithScore.push({
              path: filePath,
              line: line.trim(),
              score: score
            });
          }
        }
      }
    } else {
      // No text matches, just show file path with lower score
      resultsWithScore.push({
        path: filePath,
        line: '(match found in file)',
        score: 10
      });
    }
  }

  if (resultsWithScore.length === 0) {
    return 'Found ' + response.items.length + ' files but no line previews. Files: ' + response.items.slice(0, 5).map(i => i.path).join(', ');
  }

  // Sort by relevance score (highest first) and take top 25 results
  resultsWithScore.sort((a, b) => b.score - a.score);
  const topResults = resultsWithScore.slice(0, 25);

  // Format output
  const output = topResults.map(r => r.path + ': ' + r.line).join('\\n');

  return output + '\\n\\n(Found ' + resultsWithScore.length + ' matches, showing top ' + topResults.length + ')';
} catch (e) {
  return 'Error: ' + e.message;
}`;
}

// Update Complex Executor system prompt to strongly discourage read_file
const complexExecutor = workflow.nodes.find(n => n.name === 'Complex Executor');
if (complexExecutor) {
  console.log('✅ Updating Complex Executor system prompt');

  const currentSystemMsg = complexExecutor.parameters.options.systemMessage;
  const newSystemMsg = currentSystemMsg
    .replace(
      '⚠️ Use grep_search instead of read_file when looking for specific text',
      '⚠️ CRITICAL: Use grep_search instead of read_file when looking for text\\n⚠️ NEVER read_file for files already in context - YOU ALREADY HAVE THEM'
    );

  complexExecutor.parameters.options.systemMessage = newSystemMsg;
}

// Update Simple Executor system prompt
const simpleExecutor = workflow.nodes.find(n => n.name === 'Simple Executor');
if (simpleExecutor) {
  console.log('✅ Updating Simple Executor system prompt');

  const currentSystemMsg = simpleExecutor.parameters.options.systemMessage;
  const newSystemMsg = currentSystemMsg
    .replace(
      '⚠️ Use grep_search to find text quickly',
      '⚠️ ALWAYS use grep_search to find text - NOT read_file\\n⚠️ Files in context are ALREADY loaded - do NOT read_file them again'
    );

  simpleExecutor.parameters.options.systemMessage = newSystemMsg;
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V25.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\\n✅ Created V25 with smart grep_search!');
console.log('📁 Saved to:', outputPath);
console.log('\\n🔍 Key improvements:');
console.log('  1. grep_search now uses multi-strategy search:');
console.log('     • Exact phrase match');
console.log('     • Individual words match');
console.log('     • Quoted exact match');
console.log('  2. Case-insensitive matching');
console.log('  3. Relevance scoring (exact match = 100, partial = 80, any word = 50)');
console.log('  4. Results sorted by relevance');
console.log('  5. Returns top 25 most relevant matches');
console.log('\\n🚫 System prompt updates:');
console.log('  • Strongly discourages read_file for files already in context');
console.log('  • Forces grep_search for text finding');
console.log('  • Clear warnings: "NEVER read_file for files already in context"');
console.log('\\n💡 Now searching for "omar obeid" will:');
console.log('  1. Try exact match first');
console.log('  2. Try individual words "omar" and "obeid"');
console.log('  3. Return case-insensitive matches');
console.log('  4. Score matches by relevance');
console.log('  5. Show top results first');
