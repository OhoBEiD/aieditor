const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V39.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Fixing V40: Robust executorMode routing\n');

// ========================================
// FIX 1: Check Request Cache - Ensure executorMode is ALWAYS passed through
// ========================================
const cacheNode = workflow.nodes.find(n => n.name === 'Check Request Cache');
if (cacheNode) {
    console.log('✅ Fixing Check Request Cache to explicitly pass executorMode');

    cacheNode.parameters.jsCode = `// Check cache + Fast Complexity Classifier
// RESPECTS user executorMode override
const ctx = $input.item.json;
const siteId = ctx.site?.uuid;
const msg = (ctx.message || '').toLowerCase().trim();
const executorMode = ctx.executorMode || 'auto';

console.log('🎯 Check Request Cache - executorMode:', executorMode);

// USER MODE OVERRIDE - If user selected a mode, set isComplex accordingly and pass through
if (executorMode === 'fast') {
  console.log('⚡ FAST mode selected - forcing isComplex: false');
  return [{ json: { ...ctx, cacheHit: false, skipPlanning: false, isComplex: false, executorMode: 'fast', userModeOverride: true } }];
}
if (executorMode === 'thinking') {
  console.log('🧠 THINKING mode selected - forcing isComplex: true');
  return [{ json: { ...ctx, cacheHit: false, skipPlanning: false, isComplex: true, executorMode: 'thinking', userModeOverride: true } }];
}

// AUTO MODE - Use automatic classification
console.log('🤖 AUTO mode - using automatic classification');

// Fast complexity check - skip planning for simple requests
const SIMPLE_PATTERNS = [/^change\\s+(the\\s+)?(title|text|heading|name|brand)\\s+(to|from)/, /^(update|set|modify)\\s+(the\\s+)?(color|background|font|size)/, /^(add|remove|delete)\\s+(a\\s+)?(button|link|image|text)/, /^(fix|correct)\\s+(the\\s+)?(typo|spelling|grammar)/, /^(make|set)\\s+(it\\s+)?(bigger|smaller|larger|bolder|darker|lighter)/];
const COMPLEX_WORDS = ['integrate', 'implement', 'create new', 'build', 'add feature', 'authentication', 'api', 'database', 'state', 'multiple', 'routing', 'form'];
const isSimple = SIMPLE_PATTERNS.some(p => p.test(msg));
const hasComplex = COMPLEX_WORDS.some(c => msg.includes(c));

if (isSimple && !hasComplex) {
  console.log('Fast path: Simple request detected (auto mode)');
  return [{ json: { ...ctx, skipPlanning: true, isComplex: false, fastClassified: true, executorMode: 'auto', executionPlan: { summary: 'Simple change', tasks: [{ id: 1, task: msg, status: 'pending' }, { id: 2, task: 'Verify build', status: 'pending' }] } } }];
}

// Hash for cache
function hash(s) { let h=0; for(let i=0;i<s.length;i++) h=((h<<5)-h)+s.charCodeAt(i); return 'hash_'+Math.abs(h).toString(16); }
const requestHash = hash(msg + '_' + siteId);
if (!siteId) return [{ json: { ...ctx, cacheHit: false, requestHash, executorMode: 'auto' } }];

try {
  const cached = await this.helpers.httpRequest({ method: 'GET', url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/request_cache?request_hash=eq.' + requestHash + '&site_id=eq.' + siteId + '&limit=1', headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4' }, timeout: 5000 });
  if (Array.isArray(cached) && cached.length > 0) {
    console.log('Cache HIT');
    return [{ json: { ...ctx, cacheHit: true, skipPlanning: true, executionPlan: cached[0].plan_json, requestHash, executorMode: 'auto' } }];
  }
  return [{ json: { ...ctx, cacheHit: false, requestHash, executorMode: 'auto' } }];
} catch (e) { return [{ json: { ...ctx, cacheHit: false, requestHash, executorMode: 'auto' } }]; }`;
}

// ========================================
// FIX 2: Planning Agent - Use executorMode from input, add more logging
// ========================================
const planningAgent = workflow.nodes.find(n => n.name === 'Planning Agent');
if (planningAgent) {
    console.log('✅ Fixing Planning Agent to use executorMode from input');

    planningAgent.parameters.jsCode = `// DETERMINISTIC CLASSIFICATION V5 - Robust executorMode handling
const ctx = $input.item.json;
const msg = (ctx.message || '').toLowerCase();
const executorMode = ctx.executorMode || 'auto';

console.log('🎯 Planning Agent - executorMode:', executorMode, 'userModeOverride:', ctx.userModeOverride);

// USER OVERRIDE - Respect the mode selection from Check Request Cache
if (executorMode === 'fast' || ctx.userModeOverride && !ctx.isComplex) {
  console.log('⚡ FAST mode - returning isComplex: false');
  return [{ json: { ...ctx, isComplex: false, confidence: 1.0, matchedPattern: 'user:fast', executorMode: 'fast' } }];
}

if (executorMode === 'thinking' || ctx.userModeOverride && ctx.isComplex) {
  console.log('🧠 THINKING mode - returning isComplex: true');
  return [{ json: { ...ctx, isComplex: true, confidence: 1.0, matchedPattern: 'user:thinking', executorMode: 'thinking' } }];
}

// AUTO MODE - Use automatic classification
console.log('🤖 AUTO mode - using pattern matching');

const complexPatterns = [
  /landing\\s*page/i,
  /nice\\s+(page|landing|website)/i,
  /beautiful\\s+(page|landing|website)/i,
  /modern\\s+(page|landing|website)/i,
  /professional\\s+(page|landing|website)/i,
  /create\\s+(a\\s+)?new\\s+page/i,
  /multiple\\s+(pages|components|files)/i,
  /(full|complete|entire)\\s+(website|app|application|redesign)/i,
  /implement|integrate|connect\\s+to|setup\\s+api|configure/i,
  /api|backend|database|auth|login|signup|payment|checkout/i,
  /routing|navigation\\s+system|state\\s+management/i,
  /(dashboard|admin\\s+panel|e-?commerce|shop|store)/i,
  /responsive\\s+design|mobile\\s+and\\s+desktop/i,
  /refactor|restructure|reorganize|migrate/i
];

const simplePatterns = [
  /^(change|update|replace|set)\\s+.{2,50}\\s+(to|with|into)/i,
  /^(change|update|fix)\\s+(the\\s+)?(title|name|text|heading|color|background)/i,
  /^(remove|delete|hide)\\s+(the\\s+)?/i,
  /^(make\\s+it|set\\s+it|change\\s+it)/i,
  /^fix\\s+/i,
  /^(add|update|change)\\s+(a\\s+)?(button|link|image|text|title|heading)/i
];

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

if (matchedPattern === 'default') {
  isComplex = msg.length > 80 || msg.split(' ').length > 10;
  confidence = 0.7;
  matchedPattern = isComplex ? 'default:complex' : 'default:simple';
}

console.log('Classification:', isComplex ? 'COMPLEX' : 'SIMPLE', '-', matchedPattern);

return [{ json: { ...ctx, isComplex, confidence, matchedPattern, executorMode: 'auto' } }];`;
}

// ========================================
// FIX 3: Parse Plan - Preserve executorMode from input
// ========================================
const parsePlan = workflow.nodes.find(n => n.name === 'Parse Plan');
if (parsePlan) {
    console.log('✅ Fixing Parse Plan to preserve executorMode');

    parsePlan.parameters.jsCode = `// Parse Plan - Preserves executorMode
const ctx = $('Fetch Memory').first().json;
const classified = $input.item.json;

// Use isComplex from the classifier (Planning Agent)
const isComplex = classified.isComplex === true;
const confidence = classified.confidence || 0.9;
const matchedPattern = classified.matchedPattern || 'unknown';
const executorMode = classified.executorMode || ctx.executorMode || 'auto';

console.log('🎯 Parse Plan - isComplex:', isComplex, 'executorMode:', executorMode);

// Insert thinking step
const requestId = ctx.requestId || 'unknown';
const siteId = ctx.site?.id || 'unknown';

try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps',
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4',
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      request_id: requestId,
      site_id: siteId,
      step_number: 2,
      tool_name: 'classify',
      status: 'complete',
      message: isComplex ? 'Complex task → Complex Executor' : 'Simple task → Simple Executor',
      details: { isComplex, confidence, matchedPattern, executorMode }
    }),
    timeout: 3000
  });
} catch (e) {}

return [{
  json: {
    ...ctx,
    ...classified,
    isComplex,
    confidence,
    matchedPattern,
    executorMode,
    plan: { summary: ctx.message },
    executionPlan: { tasks: [] }
  }
}];`;
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V40.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ Created V40 - Robust executorMode routing!');
console.log('📁 Saved to:', outputPath);
console.log('\n🔧 Fixes applied:');
console.log('  ✓ Check Request Cache: Explicitly sets isComplex for fast/thinking modes');
console.log('  ✓ Planning Agent: Respects userModeOverride flag');
console.log('  ✓ Parse Plan: Preserves executorMode from classified input');
console.log('  ✓ Added console.log at each step for debugging');
