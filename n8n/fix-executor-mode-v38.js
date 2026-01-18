const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V37.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Fixing V38: Making executorMode ALWAYS respected\n');

// ========================================
// FIX 1: Update "Check Request Cache" to respect executorMode
// The issue is this node has fast classification that skips user mode
// ========================================
const cacheNode = workflow.nodes.find(n => n.name === 'Check Request Cache');
if (cacheNode) {
    console.log('✅ Fixing Check Request Cache to respect executorMode');

    cacheNode.parameters.jsCode = `// Check cache + Fast Complexity Classifier
// RESPECTS user executorMode override
const ctx = $input.item.json;
const siteId = ctx.site?.uuid;
const msg = (ctx.message || '').toLowerCase().trim();
const executorMode = ctx.executorMode || 'auto';

// USER MODE OVERRIDE - If user selected a mode, skip fast classification
if (executorMode !== 'auto') {
  console.log('User mode override: ' + executorMode + ' - skipping fast classification');
  const isComplex = executorMode === 'thinking';
  return [{ json: { ...ctx, cacheHit: false, skipPlanning: false, isComplex, executorMode, userModeOverride: true } }];
}

// Fast complexity check - skip planning for simple requests
const SIMPLE_PATTERNS = [/^change\\s+(the\\s+)?(title|text|heading|name|brand)\\s+(to|from)/, /^(update|set|modify)\\s+(the\\s+)?(color|background|font|size)/, /^(add|remove|delete)\\s+(a\\s+)?(button|link|image|text)/, /^(fix|correct)\\s+(the\\s+)?(typo|spelling|grammar)/, /^(make|set)\\s+(it\\s+)?(bigger|smaller|larger|bolder|darker|lighter)/];
const COMPLEX_WORDS = ['integrate', 'implement', 'create new', 'build', 'add feature', 'authentication', 'api', 'database', 'state', 'multiple', 'routing', 'form'];
const isSimple = SIMPLE_PATTERNS.some(p => p.test(msg));
const hasComplex = COMPLEX_WORDS.some(c => msg.includes(c));

if (isSimple && !hasComplex) {
  console.log('Fast path: Simple request detected (auto mode)');
  return [{ json: { ...ctx, skipPlanning: true, isComplex: false, fastClassified: true, executionPlan: { summary: 'Simple change', tasks: [{ id: 1, task: msg, status: 'pending' }, { id: 2, task: 'Verify build', status: 'pending' }] } } }];
}

// Hash for cache
function hash(s) { let h=0; for(let i=0;i<s.length;i++) h=((h<<5)-h)+s.charCodeAt(i); return 'hash_'+Math.abs(h).toString(16); }
const requestHash = hash(msg + '_' + siteId);
if (!siteId) return [{ json: { ...ctx, cacheHit: false, requestHash } }];

try {
  const cached = await this.helpers.httpRequest({ method: 'GET', url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/request_cache?request_hash=eq.' + requestHash + '&site_id=eq.' + siteId + '&limit=1', headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4' }, timeout: 5000 });
  if (Array.isArray(cached) && cached.length > 0) {
    console.log('Cache HIT');
    return [{ json: { ...ctx, cacheHit: true, skipPlanning: true, executionPlan: cached[0].plan_json, requestHash } }];
  }
  return [{ json: { ...ctx, cacheHit: false, requestHash } }];
} catch (e) { return [{ json: { ...ctx, cacheHit: false, requestHash } }]; }`;
}

// ========================================
// FIX 2: Update "Build Context" to also pass executorMode earlier
// ========================================
const buildContextNode = workflow.nodes.find(n => n.name === 'Build Context');
if (buildContextNode) {
    console.log('✅ Ensuring Build Context passes executorMode');

    // Check if executorMode is already in the return - if not, add it
    if (!buildContextNode.parameters.jsCode.includes('executorMode')) {
        buildContextNode.parameters.jsCode = buildContextNode.parameters.jsCode.replace(
            /githubToken\s*\}\s*\]\s*;/,
            'githubToken,\n    executorMode: inp.executorMode || \'auto\'\n  }\n}];'
        );
    }
}

// ========================================
// FIX 3: Verify Planning Agent has the executorMode check
// ========================================
const planningAgent = workflow.nodes.find(n => n.name === 'Planning Agent');
if (planningAgent) {
    console.log('✅ Verifying Planning Agent has executorMode override');
    if (planningAgent.parameters.jsCode.includes('executorMode === \'thinking\'')) {
        console.log('   ✓ Planning Agent already has correct executorMode logic');
    }
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V38.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ Created V38 - executorMode ALWAYS respected!');
console.log('📁 Saved to:', outputPath);
console.log('\n🔧 Key Fix:');
console.log('  The "Check Request Cache" node was overriding user mode selection.');
console.log('  Now it checks executorMode FIRST and skips auto-classification if user selected a mode.');
console.log('\n💡 Mode behavior (now enforced everywhere):');
console.log('  - fast: Forces Simple Executor (bypasses all auto-detection)');
console.log('  - thinking: Forces Complex Executor (bypasses all auto-detection)');
console.log('  - auto: Uses automatic classification (existing behavior)');
console.log('\n🎯 V38 = V37 + Check Request Cache fix');
