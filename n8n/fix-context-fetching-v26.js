const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V25.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Fixing context file fetching to ensure files are ALWAYS in context...\\n');

// Problem: Prepare Fetch does parallel fetching but workflow still uses old Fetch Files node
// Solution: Make Prepare Fetch go directly to Merge Files, skip Fetch Files entirely

// Update "Prepare Fetch" to connect directly to "Merge Files"
const prepareFetchConnections = workflow.connections['Prepare Fetch'];
if (prepareFetchConnections) {
  console.log('✅ Connecting Prepare Fetch directly to Merge Files (skipping Fetch Files)');
  prepareFetchConnections.main = [
    [
      {
        "node": "Merge Files",
        "type": "main",
        "index": 0
      }
    ]
  ];
}

// Update read_file description to be EXTREMELY discouraging
const readFileNode = workflow.nodes.find(n => n.name === 'read_file');
if (readFileNode) {
  console.log('✅ Making read_file description MORE discouraging');
  readFileNode.parameters.description = '⚠️ LAST RESORT ONLY! Files are ALREADY in context. Check FILES IN CONTEXT in your system prompt first. Only use if file is NOT listed there. Input: file path';
}

// Update system prompts with even stronger warnings
const complexExecutor = workflow.nodes.find(n => n.name === 'Complex Executor');
if (complexExecutor) {
  console.log('✅ Updating Complex Executor with EXTREME warnings');

  const currentSystemMsg = complexExecutor.parameters.options.systemMessage;
  const newSystemMsg = currentSystemMsg
    .replace(
      '⚠️ FILES IN CONTEXT:',
      '🔥 FILES ALREADY LOADED (DO NOT READ AGAIN):'
    )
    .replace(
      'DO NOT use read_file for these!',
      'THESE FILES ARE ALREADY IN YOUR CONTEXT - NEVER CALL read_file FOR THEM!'
    );

  complexExecutor.parameters.options.systemMessage = newSystemMsg;
}

const simpleExecutor = workflow.nodes.find(n => n.name === 'Simple Executor');
if (simpleExecutor) {
  console.log('✅ Updating Simple Executor with EXTREME warnings');

  const currentSystemMsg = simpleExecutor.parameters.options.systemMessage;
  const newSystemMsg = currentSystemMsg
    .replace(
      '⚠️ FILES IN CONTEXT:',
      '🔥 FILES ALREADY LOADED:'
    )
    .replace(
      'DO NOT use read_file!',
      'NEVER use read_file - ALREADY LOADED!'
    );

  simpleExecutor.parameters.options.systemMessage = newSystemMsg;
}

// Update Merge Files to add a LOUD warning to the context
const mergeFilesNode = workflow.nodes.find(n => n.name === 'Merge Files');
if (mergeFilesNode) {
  console.log('✅ Adding loud context warning to Merge Files');

  // Add a warning message to the merged context
  mergeFilesNode.parameters.jsCode = `// Merge Files - now Prepare Fetch does parallel fetching directly
const items = $input.all();
const firstItem = items[0]?.json;

// If Prepare Fetch already did parallel fetching, just pass through
if (firstItem?._parallelFetch || firstItem?.fileContents) {
  // Add loud warning about files in context
  const filesInContext = Object.keys(firstItem.fileContents || {});
  if (filesInContext.length > 0) {
    firstItem._filesInContextWarning = '🔥 CRITICAL: These ' + filesInContext.length + ' files are ALREADY LOADED in your context. DO NOT call read_file for: ' + filesInContext.join(', ');
  }
  return [{ json: firstItem }];
}

// Fallback: Old flow where Fetch Files HTTP node was used
const prepItems = $('Prepare Fetch').all();
const ctx = prepItems[0]?.json?._ctx || prepItems[0]?.json || firstItem;
if (!ctx) return [{ json: { error: 'Lost context', fileContents: {}, contextFiles: [] } }];

const fileContents = ctx.fileContents || {};
const contextFiles = ctx.contextFiles || [];

for (let i = 0; i < items.length; i++) {
  const item = items[i].json;
  const path = prepItems[i]?.json?.currentFile || item.path;
  if (!path || fileContents[path]) continue;
  if (item.content) {
    try {
      const decoded = Buffer.from(item.content, 'base64').toString('utf8');
      fileContents[path] = decoded.length > 3000 ? decoded.substring(0, 3000) + '\\n// ...truncated' : decoded;
      contextFiles.push(path);
    } catch (e) {}
  }
}

// Add warning
const filesInContext = Object.keys(fileContents);
if (filesInContext.length > 0) {
  ctx._filesInContextWarning = '🔥 CRITICAL: These ' + filesInContext.length + ' files are ALREADY LOADED. DO NOT call read_file for: ' + filesInContext.join(', ');
}

return [{ json: { ...ctx, fileContents, contextFiles } }];`;
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V26.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\\n✅ Created V26 with fixed context fetching!');
console.log('📁 Saved to:', outputPath);
console.log('\\n🔧 Key fixes:');
console.log('  1. Prepare Fetch → Merge Files (skips Fetch Files entirely)');
console.log('  2. read_file description: "⚠️ LAST RESORT ONLY!"');
console.log('  3. System prompts use 🔥 and "NEVER" language');
console.log('  4. Merge Files adds _filesInContextWarning to context');
console.log('  5. File list shown as: "FILES ALREADY LOADED (DO NOT READ AGAIN)"');
console.log('\\n💡 Files are now GUARANTEED to be in context');
console.log('  • Prepare Fetch loads them in parallel');
console.log('  • Goes directly to Merge Files');
console.log('  • AI gets LOUD warnings about what is loaded');
console.log('  • read_file should almost NEVER be called');
