const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V36.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Fixing V37: Adding executorMode support to bypass complexity router\n');

// ========================================
// FIX 1: Update "Validate & Detect Intent" to extract executorMode
// ========================================
const validateNode = workflow.nodes.find(n => n.name === 'Validate & Detect Intent');
if (validateNode) {
    console.log('✅ Updating Validate & Detect Intent to extract executorMode');

    validateNode.parameters.jsCode = `const b = $input.first().json.body || $input.first().json;

if (!b.siteId) throw new Error('Missing required field: siteId');
if (!b.message) throw new Error('Missing required field: message');

const msg = b.message.toLowerCase().trim();
const actionWords = /\\b(implement|create|add|build|make|fix|update|change|edit|delete|remove|install|modify|replace|refactor|style|redesign|adjust|set|configure|enable|disable|write|code)\\b/;
const questionWords = /^(what|why|how|can you|could you|should|is it|explain|describe|tell me)/;
const isQuestion = questionWords.test(msg);
const isActionIntent = actionWords.test(msg) && !isQuestion;

return [{
  json: {
    siteId: b.siteId,
    conversationId: b.conversationId || null,
    userId: b.userId || 'anon',
    message: b.message.trim(),
    requestId: 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    image: b.image || null,
    images: b.images || (b.image ? [b.image] : []),
    executorMode: b.executorMode || 'auto', // User-selected mode: auto, fast, thinking
    isActionIntent,
    isQuestion
  }
}];`;
}

// ========================================
// FIX 2: Update "Build Context" to pass executorMode through
// ========================================
const buildContextNode = workflow.nodes.find(n => n.name === 'Build Context');
if (buildContextNode) {
    console.log('✅ Updating Build Context to pass executorMode through');

    // Find and replace the return statement to include executorMode
    let jsCode = buildContextNode.parameters.jsCode;

    // Replace the return object to include executorMode
    jsCode = jsCode.replace(
        /fileContents: \{\},\s*contextFiles: \[\],\s*githubToken/g,
        'fileContents: {},\n    contextFiles: [],\n    executorMode: inp.executorMode || \'auto\',\n    githubToken'
    );

    buildContextNode.parameters.jsCode = jsCode;
}

// ========================================
// FIX 3: Update "Planning Agent" to respect executorMode override
// ========================================
const planningAgent = workflow.nodes.find(n => n.name === 'Planning Agent');
if (planningAgent) {
    console.log('✅ Updating Planning Agent to respect executorMode override');

    planningAgent.parameters.jsCode = `// DETERMINISTIC CLASSIFICATION V4 - With executorMode override
// Simple = text/style changes. Complex = new pages, landing pages, multi-file.
const ctx = $input.item.json;
const msg = (ctx.message || '').toLowerCase();
const executorMode = ctx.executorMode || 'auto';

// USER OVERRIDE - Skip classification if user explicitly selected a mode
if (executorMode === 'fast') {
  console.log('User selected FAST mode - forcing Simple Executor');
  return [{ json: { ...ctx, isComplex: false, confidence: 1.0, matchedPattern: 'user:fast', output: JSON.stringify({isComplex: false, confidence: 1.0}) } }];
}

if (executorMode === 'thinking') {
  console.log('User selected THINKING mode - forcing Complex Executor');
  return [{ json: { ...ctx, isComplex: true, confidence: 1.0, matchedPattern: 'user:thinking', output: JSON.stringify({isComplex: true, confidence: 1.0}) } }];
}

// AUTO MODE - Use automatic classification
// COMPLEX patterns - Check FIRST for these keywords
const complexPatterns = [
  // Landing pages are ALWAYS complex (require full design)
  /landing\\s*page/i,
  /nice\\s+(page|landing|website)/i,
  /beautiful\\s+(page|landing|website)/i,
  /modern\\s+(page|landing|website)/i,
  /professional\\s+(page|landing|website)/i,
  /create\\s+(a\\s+)?new\\s+page/i,
  
  // Multi-page/multi-component (explicit)
  /multiple\\s+(pages|components|files)/i,
  /(full|complete|entire)\\s+(website|app|application|redesign)/i,
  
  // Architecture/Integration
  /implement|integrate|connect\\s+to|setup\\s+api|configure/i,
  /api|backend|database|auth|login|signup|payment|checkout/i,
  /routing|navigation\\s+system|state\\s+management/i,
  
  // Advanced UI (multi-component)
  /(dashboard|admin\\s+panel|e-?commerce|shop|store)/i,
  /responsive\\s+design|mobile\\s+and\\s+desktop/i,
  
  // Refactoring
  /refactor|restructure|reorganize|migrate/i
];

// SIMPLE patterns - Text/style changes only
const simplePatterns = [
  // Text/style changes (NOT page creation)
  /^(change|update|replace|set)\\s+.{2,50}\\s+(to|with|into)/i,
  /^(change|update|fix)\\s+(the\\s+)?(title|name|text|heading|color|background)/i,
  /^(remove|delete|hide)\\s+(the\\s+)?/i,
  /^(make\\s+it|set\\s+it|change\\s+it)/i,
  /^fix\\s+/i,
  // Single component changes (NOT full pages)
  /^(add|update|change)\\s+(a\\s+)?(button|link|image|text|title|heading)/i
];

// Check COMPLEX patterns FIRST
let isComplex = false;
let confidence = 0.9;
let matchedPattern = 'default';

for (const p of complexPatterns) {
  if (p.test(msg)) {
    isComplex = true;
    confidence = 0.95;
    matchedPattern = 'complex:' + p.source.slice(0, 30);
    break;
  }
}

// Only check simple if no complex match
if (!isComplex) {
  for (const p of simplePatterns) {
    if (p.test(msg)) {
      isComplex = false;
      confidence = 0.95;
      matchedPattern = 'simple:' + p.source.slice(0, 30);
      break;
    }
  }
}

// Default: Long detailed requests = complex
if (matchedPattern === 'default') {
  isComplex = msg.length > 80 || msg.split(' ').length > 10;
  confidence = 0.7;
  matchedPattern = isComplex ? 'default:complex' : 'default:simple';
}

console.log('Classification:', isComplex ? 'COMPLEX' : 'SIMPLE', '-', matchedPattern);

return [{ json: { ...ctx, isComplex, confidence, matchedPattern, output: JSON.stringify({isComplex, confidence}) } }];`;
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V37.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ Created V37 - executorMode support!');
console.log('📁 Saved to:', outputPath);
console.log('\n🔧 Fixes applied:');
console.log('  ✓ Validate & Detect Intent: Extracts executorMode from request');
console.log('  ✓ Build Context: Passes executorMode through context');
console.log('  ✓ Planning Agent: Respects user mode override (fast/thinking/auto)');
console.log('\n💡 Mode behavior:');
console.log('  - fast: Forces Simple Executor');
console.log('  - thinking: Forces Complex Executor');
console.log('  - auto: Uses automatic classification (existing behavior)');
console.log('\n🎯 V37 = V36 (fixed planning) + executorMode support');
