const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V40.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Fixing V41: Add aggressive logging for executorMode debug\n');

// ========================================
// FIX 1: Validate & Detect Intent - Add logging for incoming executorMode
// ========================================
const validateNode = workflow.nodes.find(n => n.name === 'Validate & Detect Intent');
if (validateNode) {
    console.log('✅ Adding logging to Validate & Detect Intent');

    validateNode.parameters.jsCode = `const b = $input.first().json.body || $input.first().json;

if (!b.siteId) throw new Error('Missing required field: siteId');
if (!b.message) throw new Error('Missing required field: message');

const msg = b.message.toLowerCase().trim();
const actionWords = /\\b(implement|create|add|build|make|fix|update|change|edit|delete|remove|install|modify|replace|refactor|style|redesign|adjust|set|configure|enable|disable|write|code)\\b/;
const questionWords = /^(what|why|how|can you|could you|should|is it|explain|describe|tell me)/;
const isQuestion = questionWords.test(msg);
const isActionIntent = actionWords.test(msg) && !isQuestion;

// CRITICAL DEBUG - Log what we receive
console.log('📥 INCOMING executorMode:', b.executorMode);
console.log('📥 INCOMING body keys:', Object.keys(b).join(', '));

const executorMode = b.executorMode || 'auto';
console.log('📤 OUTGOING executorMode:', executorMode);

return [{
  json: {
    siteId: b.siteId,
    conversationId: b.conversationId || null,
    userId: b.userId || 'anon',
    message: b.message.trim(),
    requestId: 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    image: b.image || null,
    images: b.images || (b.image ? [b.image] : []),
    executorMode: executorMode,
    isActionIntent,
    isQuestion
  }
}];`;
}

// ========================================
// FIX 2: Build Context - Ensure executorMode is passed through
// ========================================
const buildContext = workflow.nodes.find(n => n.name === 'Build Context');
if (buildContext) {
    console.log('✅ Adding logging to Build Context');

    // Find the line that returns and add logging before it
    const jsCode = buildContext.parameters.jsCode;
    if (!jsCode.includes('📥 Build Context executorMode')) {
        buildContext.parameters.jsCode = jsCode.replace(
            /return \[\{/,
            `console.log('📥 Build Context executorMode from inp:', inp.executorMode);

return [{`
        );
    }
}

// ========================================
// FIX 3: Fetch Memory - Ensure executorMode is preserved
// ========================================
const fetchMemory = workflow.nodes.find(n => n.name === 'Fetch Memory');
if (fetchMemory) {
    console.log('✅ Checking Fetch Memory for executorMode pass-through');
    // The Fetch Memory node should already spread ...ctx so executorMode should be there
}

// ========================================
// FIX 4: Check Request Cache - Add very verbose logging
// ========================================
const cacheNode = workflow.nodes.find(n => n.name === 'Check Request Cache');
if (cacheNode) {
    console.log('✅ Adding verbose logging to Check Request Cache');

    cacheNode.parameters.jsCode = `// Check cache + Fast Complexity Classifier
// RESPECTS user executorMode override
const ctx = $input.item.json;
const siteId = ctx.site?.uuid;
const msg = (ctx.message || '').toLowerCase().trim();
const executorMode = ctx.executorMode || 'auto';

// VERBOSE DEBUG
console.log('🔍 Check Request Cache - ctx.executorMode:', ctx.executorMode);
console.log('🔍 Check Request Cache - resolved executorMode:', executorMode);
console.log('🔍 Check Request Cache - executorMode type:', typeof executorMode);
console.log('🔍 Check Request Cache - executorMode === "thinking":', executorMode === 'thinking');
console.log('🔍 Check Request Cache - executorMode === "fast":', executorMode === 'fast');

// USER MODE OVERRIDE - If user selected a mode, set isComplex accordingly and pass through
if (executorMode === 'fast') {
  console.log('⚡ FAST mode selected - forcing isComplex: false, routing to SIMPLE');
  return [{ json: { ...ctx, cacheHit: false, skipPlanning: false, isComplex: false, executorMode: 'fast', userModeOverride: true } }];
}
if (executorMode === 'thinking') {
  console.log('🧠 THINKING mode selected - forcing isComplex: true, routing to COMPLEX');
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
  return [{ json: { ...ctx, cacheHit: false, requestHash, executorMode } }];
} catch (e) { return [{ json: { ...ctx, cacheHit: false, requestHash, executorMode } }]; }`;
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V41.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ Created V41 - Verbose debug logging!');
console.log('📁 Saved to:', outputPath);
console.log('\n🔧 Fixes applied:');
console.log('  ✓ Validate & Detect Intent: Logs incoming executorMode');
console.log('  ✓ Build Context: Logs executorMode from inp');
console.log('  ✓ Check Request Cache: Very verbose logging on executorMode');
console.log('\n👉 After importing, check n8n logs for the debug output!');
