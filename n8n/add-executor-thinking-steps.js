// Add per-tool thinking steps to V51
const fs = require('fs');

const SUPABASE_URL = 'https://jjrbnjubjiswvxeradzw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4';

const workflow = JSON.parse(fs.readFileSync('./FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json', 'utf8'));

// Find Agent 3: Executor and add per-tool thinking steps
const executorNode = workflow.nodes.find(n => n.name === 'Agent 3: Executor');
if (executorNode) {
    const newCode = `// AGENT 3: EXECUTOR (OpenRouter - Gemini 3 Flash) WITH THINKING STEPS
const ctx = $input.item.json;
const requestId = ctx.requestId;
const siteUuid = ctx.site?.uuid || 'unknown';
const OPENROUTER_KEY = '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';
const MODEL = 'google/gemini-3-flash-preview';
const siteId = ctx.site?.id;
const githubToken = ctx.githubToken;
let stepCounter = 10;

// Thinking step helper
const emitStep = async (toolName, status, message, details = {}) => {
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
        site_id: siteUuid,
        step_number: stepCounter++,
        tool_name: toolName,
        status: status,
        message: message.substring(0, 200),
        details: details
      }),
      timeout: 3000
    });
  } catch(e) {}
};

// Emit planning step
await emitStep('planning', 'running', 'Creating execution plan...', { tasks: ctx.plan?.tasks?.length || 0 });

// Best-effort preview start
const startPreview = async () => {
  if (!siteId) return;
  try {
    await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/start', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, repoUrl: ctx.site.repo_url, gitToken: githubToken }), timeout: 5000, ignoreHttpStatusErrors: true });
  } catch (e) {}
};
await startPreview();

const TOOLS = [
  { type: 'function', function: { name: 'list_files', description: 'List files matching glob pattern', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'grep_search', description: 'Find text in codebase', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'view_lines', description: 'View specific lines of a file', parameters: { type: 'object', properties: { file: { type: 'string' }, startLine: { type: 'number' }, endLine: { type: 'number' } }, required: ['file'] } } },
  { type: 'function', function: { name: 'write_file', description: 'Create or replace entire file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'str_replace', description: 'Replace exact text in file', parameters: { type: 'object', properties: { file: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['file', 'old_text', 'new_text'] } } },
  { type: 'function', function: { name: 'generate_image', description: 'Generate AI image', parameters: { type: 'object', properties: { prompt: { type: 'string' }, fileName: { type: 'string' } }, required: ['prompt'] } } }
];

const runTool = async (name, input) => {
  if (!siteId) return 'ERROR: No siteId';
  const headers = { 'Content-Type': 'application/json' };
  const opts = { json: true, ignoreHttpStatusErrors: true };
  
  if (name === 'list_files') {
    await emitStep('list_files', 'running', 'Listing files: ' + (input.pattern || '*'));
    try { const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/search', headers, body: JSON.stringify({ siteId, pattern: input.pattern || '*', type: 'glob' }), ...opts }); 
      const result = (r?.matches || []).slice(0, 30).join('\\n') || 'No files';
      await emitStep('list_files', 'complete', 'Found ' + (r?.matches?.length || 0) + ' files');
      return result;
    } catch (e) { return 'Error: ' + e.message; }
  }
  
  if (name === 'grep_search') {
    await emitStep('grep_search', 'running', 'Searching: ' + input.pattern?.substring(0, 30));
    try { const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/search', headers, body: JSON.stringify({ siteId, pattern: input.pattern, type: 'grep' }), ...opts }); 
      const result = (r?.matches || []).slice(0, 15).join('\\n') || 'No matches';
      await emitStep('grep_search', 'complete', 'Found ' + (r?.matches?.length || 0) + ' matches');
      return result;
    } catch (e) { return 'Error: ' + e.message; }
  }
  
  if (name === 'view_lines') {
    await emitStep('read_file', 'running', 'Reading: ' + input.file);
    try { const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/read', headers, body: JSON.stringify({ siteId, filePath: input.file }), ...opts }); 
      if (!r?.content) return 'File not found'; 
      const lines = r.content.split('\\n'); 
      const start = Math.max(0, (input.startLine || 1) - 1); 
      const end = Math.min(lines.length, input.endLine || lines.length);
      await emitStep('read_file', 'complete', 'Read ' + input.file + ' (lines ' + start + '-' + end + ')');
      return lines.slice(start, end).map((l, i) => (start + i + 1) + ': ' + l).join('\\n').slice(0, 3000);
    } catch (e) { return 'Error: ' + e.message; }
  }
  
  if (name === 'write_file') {
    await emitStep('write_file', 'running', 'Creating: ' + input.path);
    try { const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/write', headers, body: JSON.stringify({ siteId, filePath: input.path, content: input.content, githubToken }), timeout: 60000, returnFullResponse: true, ...opts }); 
      if (r.statusCode >= 400) {
        await emitStep('write_file', 'error', 'Failed to create: ' + input.path);
        return 'ERROR: ' + JSON.stringify(r.body);
      }
      await emitStep('write_file', 'complete', 'Created: ' + input.path);
      return '{"success":true,"file":"' + input.path + '","action":"created"}';
    } catch (e) { return 'ERROR: ' + e.message; }
  }
  
  if (name === 'str_replace') {
    await emitStep('str_replace', 'running', 'Modifying: ' + input.file);
    try { const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/replace', headers, body: JSON.stringify({ siteId, filePath: input.file, search: input.old_text, replace: input.new_text, githubToken }), timeout: 60000, returnFullResponse: true, ...opts }); 
      if (r.statusCode >= 400) {
        await emitStep('str_replace', 'error', 'Failed to modify: ' + input.file);
        return 'ERROR: ' + JSON.stringify(r.body);
      }
      await emitStep('str_replace', 'complete', 'Modified: ' + input.file);
      return '{"success":true,"file":"' + input.file + '","action":"replaced"}';
    } catch (e) { return 'ERROR: ' + e.message; }
  }
  
  if (name === 'generate_image') {
    await emitStep('generate_image', 'running', 'Generating image: ' + input.prompt?.substring(0, 50));
    try { const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions', headers: { 'Authorization': 'Bearer ' + OPENROUTER_KEY, 'HTTP-Referer': 'https://n8n.io', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'google/gemini-2.5-flash-image-preview', messages: [{ role: 'user', content: input.prompt }] }), timeout: 45000, json: true });
      const content = r.choices?.[0]?.message?.content || '';
      const r1 = new RegExp('\\\\((https?://[^)]+)\\\\)');
      const r2 = new RegExp('(https?://[^\\\\s]+)');
      const urlMatch = content.match(r1) || content.match(r2);
      if (urlMatch) {
        await emitStep('generate_image', 'complete', 'Generated image');
        return JSON.stringify({ imageUrl: urlMatch[1] });
      }
      await emitStep('generate_image', 'error', 'Image generation failed');
      return JSON.stringify({ imageUrl: 'https://placehold.co/800x600?text=Generation+Failed', fallback: true, debug: content.slice(0, 50) });
    } catch (e) { return 'ERROR: ' + e.message; }
  }
  return 'Unknown tool';
};

const plan = ctx.plan || {};
const tasks = plan.tasks || [];
const preloadedFiles = Object.entries(ctx.fileContents || {}).map(([f, c]) => '=== ' + f + ' ===\\n' + c.slice(0, 1500)).join('\\n').slice(0, 4000);
let prompt = \`Expert Next.js dev. Rules: Minimal view_lines, write_file for new, no markdown in summary. Use <img> for external images.\\nUSER REQUEST: \${ctx.message}\\n\`;
if (tasks.length === 0) prompt += 'NEW PROJECT: create beautiful src/app/page.tsx\\n';
else { prompt += 'PLAN:\\n'; tasks.forEach((t, i) => prompt += \`\${i+1}. \${t.type} \${t.file}: \${t.description}\\n\`); if (preloadedFiles) prompt += \`\\nFILES:\\n\${preloadedFiles}\\n\`; }

let messages = [{ role: 'user', content: prompt }], output = '', steps = [], errors = 0;

for (let i = 0; i < 8; i++) {
  if (errors >= 2) { output = 'Too many errors'; break; }
  try {
    const r = await this.helpers.httpRequest({ 
      method: 'POST', 
      url: 'https://openrouter.ai/api/v1/chat/completions', 
      headers: { 
        'Authorization': 'Bearer ' + OPENROUTER_KEY, 
        'HTTP-Referer': 'https://n8n.io',
        'Content-Type': 'application/json' 
      }, 
      body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, temperature: 0.2 }), 
      timeout: 90000, 
      json: true,
      ignoreHttpStatusErrors: true,
      returnFullResponse: true
    });
    
    if (r.statusCode >= 400) {
      output = 'API Error: ' + (r.body?.error?.message || JSON.stringify(r.body));
      break;
    }
    
    const msg = r.body?.choices?.[0]?.message;
    if (!msg) { output = 'No response'; break; }
    messages.push(msg);
    if (msg.tool_calls) {
      let iterErrors = 0;
      for (const tc of msg.tool_calls) {
        let args = {}; try { args = JSON.parse(tc.function.arguments); } catch(e) {}
        const res = await runTool(tc.function.name, args);
        steps.push({ tool: tc.function.name, input: args, result: res.slice(0, 200) });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: res });
        if (res.includes('ERROR')) iterErrors++;
      }
      errors = iterErrors > 0 ? errors + 1 : 0;
    } else { output = msg.content || 'Done'; break; }
  } catch (e) {
    output = 'Fatal error: ' + e.message;
    break;
  }
}
return [{ json: { ...ctx, output, intermediateSteps: steps, iterations: steps.length } }];`;

    executorNode.parameters.jsCode = newCode;
    console.log('✅ Updated Agent 3: Executor with per-tool thinking steps');
}

// Save
fs.writeFileSync('./FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json', JSON.stringify(workflow, null, 2));
console.log('✅ V51 workflow updated with per-tool thinking steps');
console.log('📋 Import FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json into n8n');
