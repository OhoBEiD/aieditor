const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V35.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Fixing V36: Planning Agent "Code doesn\'t return items properly" error\n');

// ========================================
// FIX: Planning Agent jsCode has escaped newlines causing syntax error
// ========================================
const planningAgent = workflow.nodes.find(n => n.name === 'Planning Agent');
if (planningAgent) {
    console.log('✅ Fixing Planning Agent jsCode - replacing escaped newlines');

    // The CORRECT jsCode for deterministic classification
    planningAgent.parameters.jsCode = `// DETERMINISTIC CLASSIFICATION V3
// Simple = text/style changes. Complex = new pages, landing pages, multi-file.
const ctx = $input.item.json;
const msg = (ctx.message || '').toLowerCase();

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
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V36.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ Created V36 - Fixed Planning Agent!');
console.log('📁 Saved to:', outputPath);
console.log('\n🔧 Fix applied:');
console.log('  ✓ Replaced escaped newlines (\\\\n) with actual newlines');
console.log('  ✓ Code now correctly returns array of objects');
console.log('\n💡 The error was: jsCode had \\\\n which broke JavaScript parsing');
console.log('🎯 V36 = V35 + Fixed Planning Agent syntax');
