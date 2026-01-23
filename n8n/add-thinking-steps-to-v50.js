// Script to add thinking steps to V50-OPENROUTER workflow
const fs = require('fs');

const SUPABASE_URL = 'https://jjrbnjubjiswvxeradzw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4';

// Helper function to insert thinking step
const thinkingStepHelper = `
const insertThinkingStep = async (requestId, siteId, stepNumber, toolName, status, message, details) => {
  try {
    await this.helpers.httpRequest({
      method: 'POST',
      url: '${SUPABASE_URL}/rest/v1/thinking_steps',
      headers: {
        'apikey': '${SUPABASE_KEY}',
        'Authorization': 'Bearer ${SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        request_id: requestId,
        site_id: siteId,
        step_number: stepNumber,
        tool_name: toolName,
        status: status,
        message: message,
        details: details || {}
      }),
      timeout: 3000
    });
  } catch(e) { console.log('Thinking step error:', e.message); }
};
`;

const workflow = JSON.parse(fs.readFileSync('./FIXED-AGENT-WORKFLOW-V50-OPENROUTER.json', 'utf8'));

// Find and update Fetch Memory node to add initial thinking step
const fetchMemoryNode = workflow.nodes.find(n => n.name === 'Fetch Memory');
if (fetchMemoryNode) {
    const oldCode = fetchMemoryNode.parameters.jsCode;
    const newCode = `// FETCH MEMORY - Get conversation history for context
const ctx = $input.item.json;
const siteId = ctx.site?.uuid;
const requestId = ctx.requestId || 'unknown';
const conversationId = ctx.conversationId || null;

// Insert initial thinking step
try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: '${SUPABASE_URL}/rest/v1/thinking_steps',
    headers: {
      'apikey': '${SUPABASE_KEY}',
      'Authorization': 'Bearer ${SUPABASE_KEY}',
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      request_id: requestId,
      site_id: siteId,
      conversation_id: conversationId,
      step_number: 1,
      tool_name: 'analyze',
      status: 'running',
      message: 'Analyzing request...',
      details: { message: ctx.message?.substring(0, 100) }
    }),
    timeout: 5000
  });
} catch (e) { console.log('Initial thinking step error:', e.message); }

if (!siteId) {
  return [{ json: { ...ctx, memoryContext: 'First request.' } }];
}

try {
  let memoryUrl = '${SUPABASE_URL}/rest/v1/agent_memory?project_id=eq.' + siteId;
  if (conversationId) {
    memoryUrl += '&or=(session_id.eq.' + conversationId + ',session_id.is.null)';
  }
  memoryUrl += '&order=created_at.desc&limit=5';

  const response = await this.helpers.httpRequest({
    method: 'GET',
    url: memoryUrl,
    headers: {
      'apikey': '${SUPABASE_KEY}',
      'Authorization': 'Bearer ${SUPABASE_KEY}'
    },
    timeout: 10000
  });

  let memoryContext = 'First request in session.';
  if (Array.isArray(response) && response.length > 0) {
    memoryContext = 'Recent conversation:\\n' + response.reverse().map(function(e) {
      const d = e.content_json || {};
      const msg = (d.message || '').slice(0, 80);
      const files = (d.filesModified || []).concat(d.filesCreated || []).map(f => f.split('/').pop()).join(', ');
      const result = (d.summary || 'ok').slice(0, 60);
      return '- User: ' + msg + (files ? ' → Modified: [' + files + ']' : '') + ' → ' + result;
    }).join('\\n');
  }

  console.log('📝 Memory loaded:', response.length || 0, 'items');
  return [{ json: { ...ctx, memoryContext } }];
} catch (e) {
  console.error('Memory fetch error:', e.message);
  return [{ json: { ...ctx, memoryContext: 'First request.' } }];
}`;
    fetchMemoryNode.parameters.jsCode = newCode;
    console.log('✅ Updated Fetch Memory with initial thinking step');
}

// Find and update Parse Results node to add completion thinking step
const parseResultsNode = workflow.nodes.find(n => n.name === 'Parse Results');
if (parseResultsNode) {
    const newCode = `// PARSE RESULTS with thinking step completion
const ctx = $input.item.json;
const requestId = ctx.requestId || 'unknown';
const siteId = ctx.site?.uuid || ctx.site?.id || 'unknown';

if (ctx.isDirectResponse) {
  // Insert completion thinking step for direct response
  try {
    await this.helpers.httpRequest({
      method: 'POST',
      url: '${SUPABASE_URL}/rest/v1/thinking_steps',
      headers: {
        'apikey': '${SUPABASE_KEY}',
        'Authorization': 'Bearer ${SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        request_id: requestId,
        site_id: siteId,
        step_number: 999999,
        tool_name: 'complete',
        status: 'complete',
        message: ctx.output?.substring(0, 100) || 'Response sent',
        details: { type: 'direct_response' }
      }),
      timeout: 3000
    });
  } catch(e) {}
  
  return [{ json: { ...ctx, plan: { humanSummary: ctx.output, warnings: [] }, filesModified: [], filesCreated: [], filesDeleted: [], toolsUsed: [], iterations: 0 } }];
}

const steps = ctx.intermediateSteps || [];
const modified = new Set(), created = new Set(), deleted = new Set(), tools = [];

steps.forEach(s => {
  if (s.tool) tools.push(s.tool);
  try {
    const r = typeof s.result === 'string' ? JSON.parse(s.result.match(/\\{.*\\}/s)?.[0] || '{}') : s.result;
    if (r.success && r.file) {
      if (r.action === 'created') created.add(r.file);
      else if (r.action === 'replaced') modified.add(r.file);
    }
  } catch {}
});

// Insert completion thinking step
try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: '${SUPABASE_URL}/rest/v1/thinking_steps',
    headers: {
      'apikey': '${SUPABASE_KEY}',
      'Authorization': 'Bearer ${SUPABASE_KEY}',
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      request_id: requestId,
      site_id: siteId,
      step_number: 999999,
      tool_name: 'complete',
      status: 'complete',
      message: ctx.output?.substring(0, 150) || 'Execution completed',
      details: { filesModified: [...modified], filesCreated: [...created], filesDeleted: [...deleted], toolsUsed: [...new Set(tools)], iterations: steps.length }
    }),
    timeout: 3000
  });
} catch(e) {}

return [{ json: {
  ...ctx,
  plan: { humanSummary: ctx.output || ctx.plan?.summary || 'Done', warnings: ctx.validation?.issues || [] },
  filesModified: [...modified],
  filesCreated: [...created],
  filesDeleted: [...deleted],
  iterations: steps.length,
  toolsUsed: [...new Set(tools)]
} }];`;
    parseResultsNode.parameters.jsCode = newCode;
    console.log('✅ Updated Parse Results with completion thinking step');
}

// Save the updated workflow
fs.writeFileSync('./FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json', JSON.stringify(workflow, null, 2));
console.log('✅ Saved as FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json');
console.log('📋 Import this workflow into n8n to enable thinking steps');
