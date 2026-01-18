const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V41.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Creating V42: Direct Input Router based on executor_mode from database\n');
console.log('GOAL: Respect user mode selection (fast/thinking/auto) by reading from messages.executor_mode\n');

// ========================================
// STEP 1: Remove Planning Agent and Parse Plan nodes
// ========================================
console.log('✅ Removing Planning Agent and Parse Plan nodes');
workflow.nodes = workflow.nodes.filter(n =>
  n.name !== 'Planning Agent' && n.name !== 'Parse Plan'
);

// ========================================
// STEP 2: Replace Complexity Router with Input Router
// ========================================
const complexityRouter = workflow.nodes.find(n => n.name === 'Complexity Router');
if (complexityRouter) {
  console.log('✅ Replacing Complexity Router with Input Router');

  complexityRouter.name = 'Input Router';
  complexityRouter.parameters = {
    "rules": {
      "values": [
        {
          "conditions": {
            "options": {
              "caseSensitive": true,
              "leftValue": "",
              "typeValidation": "strict",
              "version": 2
            },
            "conditions": [
              {
                "leftValue": "={{ $json.executorMode }}",
                "rightValue": "fast",
                "operator": {
                  "type": "string",
                  "operation": "equals"
                },
                "id": "fast-mode-check"
              }
            ],
            "combinator": "and"
          },
          "renameOutput": true,
          "outputKey": "Fast Mode (Simple Executor)"
        },
        {
          "conditions": {
            "options": {
              "caseSensitive": true,
              "leftValue": "",
              "typeValidation": "strict",
              "version": 2
            },
            "conditions": [
              {
                "leftValue": "={{ $json.executorMode }}",
                "rightValue": "thinking",
                "operator": {
                  "type": "string",
                  "operation": "equals"
                },
                "id": "thinking-mode-check"
              }
            ],
            "combinator": "and"
          },
          "renameOutput": true,
          "outputKey": "Thinking Mode (Complex Executor)"
        }
      ]
    },
    "options": {
      "fallbackOutput": "extra"
    }
  };
}

// ========================================
// STEP 3: Update Check Request Cache to read executor_mode from database
// ========================================
const checkCache = workflow.nodes.find(n => n.name === 'Check Request Cache');
if (checkCache) {
  console.log('✅ Updating Check Request Cache to fetch executor_mode from messages table');

  checkCache.parameters.jsCode = `// Enhanced Cache Check + Fetch executor_mode from messages table
const ctx = $input.item.json;
const siteId = ctx.site?.uuid;
const msg = (ctx.message || '').toLowerCase().trim();
const conversationId = ctx.conversationId;

// DEFAULT: If no conversationId, use the mode from the request body
let executorMode = ctx.executorMode || 'auto';

// CRITICAL: If conversationId exists, fetch the ACTUAL executor_mode from the database
if (conversationId && siteId) {
  console.log('🔍 Fetching executor_mode from messages table for conversation:', conversationId);

  try {
    const messagesResponse = await this.helpers.httpRequest({
      method: 'GET',
      url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/messages?conversation_id=eq.' + conversationId + '&select=executor_mode&order=created_at.desc&limit=1',
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4'
      },
      timeout: 5000
    });

    if (Array.isArray(messagesResponse) && messagesResponse.length > 0 && messagesResponse[0].executor_mode) {
      executorMode = messagesResponse[0].executor_mode;
      console.log('✅ Fetched executor_mode from DB:', executorMode);
    } else {
      console.log('⚠️ No executor_mode found in DB, using default:', executorMode);
    }
  } catch (e) {
    console.error('❌ Failed to fetch executor_mode from DB:', e.message);
    console.log('⚠️ Falling back to request body executorMode:', executorMode);
  }
}

console.log('🎯 Final executorMode:', executorMode);

// Hash for cache
function hash(s) { let h=0; for(let i=0;i<s.length;i++) h=((h<<5)-h)+s.charCodeAt(i); return 'hash_'+Math.abs(h).toString(16); }
const requestHash = hash(msg + '_' + siteId);

// Fast path for simple patterns (only in AUTO mode)
if (executorMode === 'auto') {
  const SIMPLE_PATTERNS = [/^change\\s+(the\\s+)?(title|text|heading|name|brand)\\s+(to|from)/, /^(update|set|modify)\\s+(the\\s+)?(color|background|font|size)/, /^(add|remove|delete)\\s+(a\\s+)?(button|link|image|text)/, /^(fix|correct)\\s+(the\\s+)?(typo|spelling|grammar)/, /^(make|set)\\s+(it\\s+)?(bigger|smaller|larger|bolder|darker|lighter)/];
  const COMPLEX_WORDS = ['integrate', 'implement', 'create new', 'build', 'add feature', 'authentication', 'api', 'database', 'state', 'multiple', 'routing', 'form'];
  const isSimple = SIMPLE_PATTERNS.some(p => p.test(msg));
  const hasComplex = COMPLEX_WORDS.some(c => msg.includes(c));

  if (isSimple && !hasComplex) {
    console.log('⚡ AUTO mode: Fast path detected (simple request)');
    executorMode = 'fast'; // Override to fast mode for simple requests
  }
}

// Try cache lookup
if (siteId) {
  try {
    const cached = await this.helpers.httpRequest({
      method: 'GET',
      url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/request_cache?request_hash=eq.' + requestHash + '&site_id=eq.' + siteId + '&limit=1',
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4'
      },
      timeout: 5000
    });

    if (Array.isArray(cached) && cached.length > 0) {
      console.log('📦 Cache HIT');
      return [{ json: { ...ctx, cacheHit: true, skipPlanning: true, executionPlan: cached[0].plan_json, requestHash, executorMode } }];
    }
  } catch (e) {
    console.log('⚠️ Cache lookup failed:', e.message);
  }
}

return [{ json: { ...ctx, cacheHit: false, requestHash, executorMode } }];`;
}

// ========================================
// STEP 4: Update workflow connections
// ========================================
console.log('✅ Updating workflow connections');

// Remove old connections from Planning Agent and Parse Plan
delete workflow.connections['Planning Agent'];
delete workflow.connections['Parse Plan'];

// Update Check Request Cache to connect directly to Input Router
workflow.connections['Check Request Cache'] = {
  "main": [
    [
      {
        "node": "Input Router",
        "type": "main",
        "index": 0
      }
    ]
  ]
};

// Update Input Router (formerly Complexity Router) connections
workflow.connections['Input Router'] = {
  "main": [
    [
      {
        "node": "Simple Executor",
        "type": "main",
        "index": 0
      }
    ],
    [
      {
        "node": "Complex Executor",
        "type": "main",
        "index": 0
      }
    ],
    [
      {
        "node": "Simple Executor", // Fallback to simple for 'auto' mode
        "type": "main",
        "index": 0
      }
    ]
  ]
};

// ========================================
// STEP 5: Update Simple and Complex Executors to handle context properly
// ========================================
console.log('✅ Updating executors to accept context from Input Router');

// No changes needed - executors already accept context from previous node

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V42.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ Created V42 - Direct Input Router Workflow!');
console.log('📁 Saved to:', outputPath);
console.log('\n🎯 Changes Made:');
console.log('  ✓ Removed Planning Agent node');
console.log('  ✓ Removed Parse Plan node');
console.log('  ✓ Replaced Complexity Router with Input Router');
console.log('  ✓ Input Router reads executor_mode from messages table');
console.log('  ✓ Routes directly based on user selection:');
console.log('    - "fast" → Simple Executor');
console.log('    - "thinking" → Complex Executor');
console.log('    - "auto" (fallback) → Simple Executor (with smart pattern detection)');
console.log('\n📊 Flow:');
console.log('  Webhook → Validate → Load Site → Build Context → Prepare Fetch → Fetch Files');
console.log('  → Merge Files → Fetch Memory → Check for Image → Merge Analysis → Cleanup Payload');
console.log('  → Check Request Cache (fetches executor_mode from DB)');
console.log('  → Input Router (routes based on executor_mode)');
console.log('  → Simple Executor OR Complex Executor');
console.log('  → Merge Results → Parse Results → Save Memory → Git Push → Response');
console.log('\n💡 Key Benefits:');
console.log('  • Simpler flow: 2 fewer nodes');
console.log('  • Direct routing: No complex pattern matching');
console.log('  • User control: Respects executor_mode from database');
console.log('  • Faster: Skips unnecessary classification logic');
