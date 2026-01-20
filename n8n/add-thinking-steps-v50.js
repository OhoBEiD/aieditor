// Add thinking steps to V49 workflow (creates V50)
const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V49-WORKSPACE-FIX.json');
const outputFile = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V50-WITH-THINKING.json');

// Read workflow
const workflow = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4';

// Helper function to create thinking step insert code
const logThinkingCode = `
const logThinking = async (requestId, siteId, stepNumber, toolName, status, message, details = {}) => {
  try {
    await this.helpers.httpRequest({
      method: 'POST',
      url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps',
      headers: {
        'apikey': '${SUPABASE_KEY}',
        'Authorization': 'Bearer ${SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ request_id: requestId, site_id: siteId, step_number: stepNumber, tool_name: toolName, status, message, details }),
      timeout: 5000
    });
  } catch (e) { console.error('Thinking step log error:', e.message); }
};`;

// Track modifications
let modifications = 0;

workflow.nodes.forEach(node => {
  // 1. Update Fetch Memory - add initial thinking step
  if (node.name === 'Fetch Memory') {
    const originalCode = node.parameters.jsCode;
    const newCode = `// FETCH MEMORY - Get conversation history for context
const ctx = $input.item.json;
const siteId = ctx.site?.uuid;
const requestId = ctx.requestId || 'unknown';
const conversationId = ctx.conversationId || null;

if (!siteId) {
  return [{ json: { ...ctx, memoryContext: 'First request.' } }];
}

// Log initial thinking step
try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps',
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
      details: { message: ctx.message?.slice(0, 100) }
    }),
    timeout: 5000
  });
} catch (e) { console.error('Thinking step log error:', e.message); }

try {
  let memoryUrl = 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/agent_memory?project_id=eq.' + siteId;
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
    node.parameters.jsCode = newCode;
    console.log('✅ Updated: Fetch Memory');
    modifications++;
  }

  // 2. Update Intent Classifier - add thinking step after classification
  if (node.name === 'Agent 1: Intent Classifier') {
    const originalCode = node.parameters.jsCode;
    // Add thinking step logging after classification
    const thinkingInsert = `
// Log intent classification result
try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps',
    headers: {
      'apikey': '${SUPABASE_KEY}',
      'Authorization': 'Bearer ${SUPABASE_KEY}',
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      request_id: ctx.requestId,
      site_id: ctx.site?.id,
      step_number: 2,
      tool_name: 'classify',
      status: 'complete',
      message: 'Intent classified: ' + intent.type + ' (confidence: ' + (intent.confidence * 100).toFixed(0) + '%)',
      details: intent
    }),
    timeout: 5000
  });
} catch (e) {}

`;
    // Insert before the final return
    const newCode = originalCode.replace(
      /return \[\{ json: \{ \.\.\.ctx, intent \} \}\];$/m,
      thinkingInsert + 'return [{ json: { ...ctx, intent } }];'
    );
    node.parameters.jsCode = newCode;
    console.log('✅ Updated: Agent 1: Intent Classifier');
    modifications++;
  }

  // 3. Update Parse Results - add completion thinking step
  if (node.name === 'Parse Results') {
    const originalCode = node.parameters.jsCode;
    const newCode = `// PARSE RESULTS
const ctx = $input.item.json;
const requestId = ctx.requestId || 'unknown';
const siteId = ctx.site?.id || 'unknown';

if (ctx.isDirectResponse) {
  // Log completion for direct responses
  try {
    await this.helpers.httpRequest({
      method: 'POST',
      url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps',
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
        message: 'Response ready',
        details: {}
      }),
      timeout: 5000
    });
  } catch (e) {}

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

// Log completion thinking step
try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps',
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
      message: ctx.output || 'Request completed',
      details: { filesModified: [...modified], filesCreated: [...created], filesDeleted: [...deleted], toolsUsed: [...new Set(tools)] }
    }),
    timeout: 5000
  });
} catch (e) {}

return [{ json: {
  ...ctx,
  plan: { humanSummary: ctx.output || ctx.plan?.summary || 'Done', warnings: ctx.validation?.issues || [] },
  filesModified: [...modified],
  filesCreated: [...created],
  filesDeleted: [...deleted],
  iterations: steps.length,
  toolsUsed: [...new Set(tools)]
} }];`;
    node.parameters.jsCode = newCode;
    console.log('✅ Updated: Parse Results');
    modifications++;
  }

  // 4. Update Agent 3: Executor - add thinking steps for tool calls
  if (node.name === 'Agent 3: Executor') {
    const originalCode = node.parameters.jsCode;
    // Add logging helper and step counter
    const logHelper = `
let stepCounter = 10;
const logStep = async (toolName, message, status = 'running', details = {}) => {
  try {
    await this.helpers.httpRequest({
      method: 'POST',
      url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps',
      headers: {
        'apikey': '${SUPABASE_KEY}',
        'Authorization': 'Bearer ${SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        request_id: requestId,
        site_id: siteId,
        step_number: stepCounter++,
        tool_name: toolName,
        status,
        message,
        details
      }),
      timeout: 3000
    });
  } catch (e) {}
};

`;
    // Insert after const declarations and before tool definitions
    let newCode = originalCode.replace(
      /(const githubToken = ctx\.githubToken;)/,
      '$1\n' + logHelper
    );

    // Add logging inside runTool function for each tool execution
    newCode = newCode.replace(
      /const runTool = async \(name, input\) => \{/,
      `const runTool = async (name, input) => {
  await logStep(name, 'Executing ' + name + '...', 'running', { input: JSON.stringify(input).slice(0, 200) });
  `
    );

    // Add logging after each tool success
    newCode = newCode.replace(
      /steps\.push\(\{ tool: c\.functionCall\.name, input: c\.functionCall\.args, result: res\.slice\(0, 300\) \}\);/g,
      `steps.push({ tool: c.functionCall.name, input: c.functionCall.args, result: res.slice(0, 300) });
    await logStep(c.functionCall.name, res.includes('ERROR') ? 'Error: ' + res.slice(0, 100) : 'Completed ' + c.functionCall.name, res.includes('ERROR') ? 'error' : 'complete', { result: res.slice(0, 200) });`
    );

    node.parameters.jsCode = newCode;
    console.log('✅ Updated: Agent 3: Executor');
    modifications++;
  }

  // 5. Update Agent 2: Planner - add thinking step when planning starts
  if (node.name === 'Agent 2: Planner') {
    const originalCode = node.parameters.jsCode;
    // Add logging at start of planner
    const logStart = `
// Log planner start
try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps',
    headers: {
      'apikey': '${SUPABASE_KEY}',
      'Authorization': 'Bearer ${SUPABASE_KEY}',
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      request_id: ctx.requestId,
      site_id: ctx.site?.id,
      step_number: 5,
      tool_name: 'planner',
      status: 'running',
      message: 'Planning implementation...',
      details: { message: ctx.message?.slice(0, 100) }
    }),
    timeout: 5000
  });
} catch (e) {}

`;
    const newCode = originalCode.replace(
      /console\.log\('🧠 Planner 2\.0 active for:', ctx\.message\);/,
      `console.log('🧠 Planner 2.0 active for:', ctx.message);
${logStart}`
    );
    node.parameters.jsCode = newCode;
    console.log('✅ Updated: Agent 2: Planner');
    modifications++;
  }
});

// Write output
fs.writeFileSync(outputFile, JSON.stringify(workflow, null, 2));
console.log(`\n📝 Total modifications: ${modifications}`);
console.log('📄 Created:', outputFile);
