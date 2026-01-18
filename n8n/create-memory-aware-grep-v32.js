const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V31.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Creating V32: Memory-aware grep_search\n');
console.log('FEATURE: grep_search checks memory context to understand recent changes\n');

// ========================================
// FIX: Make grep_search memory-aware
// ========================================
const grepSearchNode = workflow.nodes.find(n => n.name === 'grep_search');
if (grepSearchNode) {
  console.log('✅ Adding memory intelligence to grep_search');
  console.log('   - Checks memoryContext for recent changes');
  console.log('   - If user says "change it to X" and last change was Y, searches for Y');
  console.log('   - Extracts file paths and search terms from memory\n');

  grepSearchNode.parameters.jsCode = `const rawInput = $fromAI('query');
const searchText = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

if (!searchText) return 'Error: Search text required';

const ctx = $('Merge Files')?.item?.json || {};
const fileContents = ctx.fileContents || {};
const owner = ctx.owner;
const repo = ctx.repo;
const branch = ctx.branch || 'main';
const githubToken = ctx.githubToken;
const memoryContext = ctx.memoryContext || '';

// MEMORY INTELLIGENCE: Extract recent changes from memory
let actualSearchText = searchText;
let targetFiles = [];

if (memoryContext) {
  // Parse memory to find recent changes
  // Memory format: "msg→[files]→result"
  const memoryLines = memoryContext.split('\\n');

  for (const line of memoryLines) {
    // Look for patterns like: changed X to Y, replaced X with Y, updated X to Y
    const changePatterns = [
      /changed? (?:["']?([^"']+)["']? )?(?:to|into|→) ["']?([^"']+)["']?/i,
      /replaced? ["']?([^"']+)["']? with ["']?([^"']+)["']?/i,
      /updated? (?:["']?([^"']+)["']? )?(?:to|into|→) ["']?([^"']+)["']?/i,
      /str_replace.*?["']([^"']+)["'].*?["']([^"']+)["']?/i
    ];

    for (const pattern of changePatterns) {
      const match = line.match(pattern);
      if (match) {
        const oldValue = match[1];
        const newValue = match[2];

        // If user is now asking to change "it" or refers to the new value,
        // we should search for the new value (what was just changed TO)
        if (searchText.toLowerCase().includes('it') ||
            (newValue && searchText.toLowerCase().includes(newValue.toLowerCase().slice(0, 10)))) {
          actualSearchText = newValue;
          console.log('🧠 Memory hint: User likely referring to recently changed value:', newValue);
          break;
        }
      }
    }

    // Extract file paths from memory
    const fileMatch = line.match(/([\\w\\/.-]+\\.(?:tsx?|jsx?|html|css|json|md))/);
    if (fileMatch && !targetFiles.includes(fileMatch[1])) {
      targetFiles.push(fileMatch[1]);
    }
  }
}

console.log('🔍 Search strategy:', {
  original: searchText,
  actual: actualSearchText,
  targetFiles: targetFiles.length > 0 ? targetFiles : 'all loaded files',
  hasMemory: !!memoryContext
});

// STRATEGY 1: Search in already-loaded files first (most reliable)
const searchLower = actualSearchText.toLowerCase();
const localResults = [];

// If we have target files from memory, search those first
const filesToSearch = targetFiles.length > 0
  ? Object.entries(fileContents).filter(([path]) => targetFiles.some(tf => path.includes(tf)))
  : Object.entries(fileContents);

for (const [filePath, content] of filesToSearch) {
  if (typeof content !== 'string') continue;
  const lines = content.split('\\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();

    // Case-insensitive search
    if (lineLower.includes(searchLower)) {
      localResults.push({
        file: filePath,
        line: i + 1,
        content: line.trim().substring(0, 150),
        exact: true,
        fromMemory: targetFiles.some(tf => filePath.includes(tf))
      });
    }
    // Partial word match
    else {
      const words = actualSearchText.split(/\\s+/).filter(w => w.length > 2);
      if (words.length > 0 && words.every(w => lineLower.includes(w.toLowerCase()))) {
        localResults.push({
          file: filePath,
          line: i + 1,
          content: line.trim().substring(0, 150),
          exact: false,
          fromMemory: targetFiles.some(tf => filePath.includes(tf))
        });
      }
    }
  }
}

if (localResults.length > 0) {
  // Sort: exact matches first, then memory-targeted files first
  localResults.sort((a, b) => {
    if (a.exact !== b.exact) return (b.exact ? 1 : 0) - (a.exact ? 1 : 0);
    if (a.fromMemory !== b.fromMemory) return (b.fromMemory ? 1 : 0) - (a.fromMemory ? 1 : 0);
    return 0;
  });

  const top = localResults.slice(0, 20);
  let result = 'Found in loaded files:\\n' + top.map(r => r.file + ':' + r.line + ': ' + r.content).join('\\n');

  if (actualSearchText !== searchText) {
    result = '🧠 Memory hint: Searching for "' + actualSearchText + '" (recently changed value)\\n' + result;
  }

  return result;
}

// If no results in target files, search all loaded files
if (targetFiles.length > 0 && filesToSearch.length < Object.keys(fileContents).length) {
  console.log('⚠️ No results in memory-targeted files, searching all loaded files');

  for (const [filePath, content] of Object.entries(fileContents)) {
    if (typeof content !== 'string') continue;
    if (filesToSearch.some(([p]) => p === filePath)) continue; // Skip already searched

    const lines = content.split('\\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLower = line.toLowerCase();

      if (lineLower.includes(searchLower)) {
        localResults.push({
          file: filePath,
          line: i + 1,
          content: line.trim().substring(0, 150),
          exact: true,
          fromMemory: false
        });
      }
    }
  }

  if (localResults.length > 0) {
    const top = localResults.slice(0, 20);
    return 'Found in other loaded files:\\n' + top.map(r => r.file + ':' + r.line + ': ' + r.content).join('\\n');
  }
}

// STRATEGY 2: Use GitHub API for files not in context
if (!owner || !repo || !githubToken) {
  return 'No matches in loaded files. Repository context not available for broader search.';
}

try {
  // Try GitHub Code Search
  const query = actualSearchText + ' repo:' + owner + '/' + repo;
  const response = await this.helpers.httpRequest({
    method: 'GET',
    url: 'https://api.github.com/search/code?q=' + encodeURIComponent(query) + '&per_page=15',
    headers: {
      'Authorization': 'Bearer ' + githubToken,
      'Accept': 'application/vnd.github.text-match+json'
    },
    timeout: 15000,
    json: true
  });

  if (!response.items || response.items.length === 0) {
    return 'No matches found for: ' + actualSearchText + '. The text may not exist or try different words.';
  }

  const results = [];
  for (const item of response.items.slice(0, 10)) {
    let preview = '(file contains match)';
    if (item.text_matches && item.text_matches[0]) {
      const frag = item.text_matches[0].fragment || '';
      const lines = frag.split('\\n').filter(l => l.toLowerCase().includes(searchLower));
      if (lines.length > 0) preview = lines[0].trim().substring(0, 100);
    }
    results.push(item.path + ': ' + preview);
  }

  return 'GitHub search results:\\n' + results.join('\\n');
} catch (e) {
  return 'No matches in loaded files. GitHub search failed: ' + e.message;
}`;
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V32.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('✅ Created V32 - Memory-Aware grep_search!');
console.log('📁 Saved to:', outputPath);
console.log('\n🧠 Memory Intelligence Features:');
console.log('  1. Parses memoryContext to find recent changes');
console.log('  2. Detects patterns: "changed X to Y", "replaced X with Y", "updated X to Y"');
console.log('  3. If user says "change it to Z", searches for Y (the recent value)');
console.log('  4. Extracts file paths from memory and searches those first');
console.log('  5. Prioritizes results from recently-modified files');
console.log('\n💡 Example workflow:');
console.log('  User: "change omar obeid to omar ai"');
console.log('  → Memory: "changed omar obeid to omar ai in page.tsx"');
console.log('  User: "change it to omar services"');
console.log('  → grep_search detects "it" refers to "omar ai" from memory');
console.log('  → Searches for "omar ai" in page.tsx (from memory)');
console.log('  → Returns: page.tsx:5: <h1>omar ai</h1>');
console.log('\n⚡ Smart prioritization:');
console.log('  1. Exact matches in memory-targeted files (highest priority)');
console.log('  2. Partial matches in memory-targeted files');
console.log('  3. Exact matches in other loaded files');
console.log('  4. GitHub API search (fallback)');
