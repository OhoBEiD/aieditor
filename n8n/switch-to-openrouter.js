const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V49-WORKSPACE-FIX.json');
const outputFile = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V50-OPENROUTER.json');

const workflow = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

const OPENROUTER_KEY = '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';
const MODEL = 'google/gemini-3-flash-preview';

// --- NEW CODE DEFINITIONS ---

// 1. Agent 1: Intent Classifier
const AGENT_1_CODE = `// AGENT 1: INTENT CLASSIFIER (OpenRouter Gemini)
const ctx = $input.item.json;
const msg = ctx.message || '';
const msgLower = (msg || '').toLowerCase();

// FAST PATH: Regex-based classification
const SIMPLE_EDIT = [
  /^(change|update|set|fix|replace|modify)\\s+(the\\s+)?(title|text|heading|name|color|background|font|size|padding|margin)/i,
  /^make\\s+(it|the|this)\\s+(bigger|smaller|larger|bolder|darker|lighter|centered)/i,
  /^(remove|delete|hide)\\s+(the\\s+)?\\w{2,20}$/i,
  /^(add|put|insert)\\s+(a\\s+)?(comma|period|space|word)/i
];

const QUESTIONS = [
  /^(what|why|how|can you|could you|should|is it|explain|describe|tell me|where|when|who)/i,
  /^(do you|does it|have you|will it)/i,
  /\\?\\s*$/
];

const COMPLEX_KEYWORDS = ['implement', 'create', 'build', 'add feature', 'new page', 'new component', 'integrate', 'api', 'database', 'authentication', 'form with', 'multiple'];

const isSimple = SIMPLE_EDIT.some(p => p.test(msg));
const isQuestion = QUESTIONS.some(p => p.test(msg));
const hasComplexKeyword = COMPLEX_KEYWORDS.some(k => msgLower.includes(k));

if (isQuestion && !hasComplexKeyword) {
  return [{ json: { ...ctx, intent: { type: 'question', confidence: 0.9, needsPlanner: false, source: 'regex' } } }];
}
if (isSimple && !hasComplexKeyword) {
  return [{ json: { ...ctx, intent: { type: 'simple_edit', confidence: 0.9, needsPlanner: false, source: 'regex' } } }];
}
if (hasComplexKeyword) {
  return [{ json: { ...ctx, intent: { type: 'complex_feature', confidence: 0.85, needsPlanner: true, source: 'regex' } } }];
}

// SLOW PATH: API Method (OpenRouter)
console.log('🤔 Ambiguous request, calling Gemini via OpenRouter...');
const OPENROUTER_KEY = '${OPENROUTER_KEY}';

try {
  const r = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: { 
      'Authorization': 'Bearer ' + OPENROUTER_KEY,
      'HTTP-Referer': 'https://n8n.io',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: '${MODEL}',
      messages: [{ role: 'user', content: 'Classify this request: \"' + msg.substring(0, 300) + '\"\\n\\nRespond ONLY with JSON: {\\\"type\\\":\\\"simple_edit|complex_feature|question|clarification\\\",\\\"confidence\\\":0.X}' }],
      response_format: { type: 'json_object' }
    }),
    timeout: 10000,
    json: true
  });

  const text = r.choices?.[0]?.message?.content || '{}';
  const intent = JSON.parse(text.match(/\\{[^}]+\\}/)?.[0] || '{\\\"type\\\":\\\"simple_edit\\\",\\\"confidence\\\":0.5}');
  intent.needsPlanner = intent.type === 'complex_feature' || intent.confidence < 0.7;
  intent.source = 'gemini-openrouter';
  
  return [{ json: { ...ctx, intent } }];
} catch (e) {
  console.error('Gemini error:', e.message);
  return [{ json: { ...ctx, intent: { type: 'simple_edit', confidence: 0.5, needsPlanner: true, source: 'fallback' } } }];
}`;

// 2. Question Responder
const QUESTION_RESPONDER_CODE = `// QUESTION RESPONDER (OpenRouter - Gemini)
const ctx = $input.item.json;
const OPENROUTER_KEY = '${OPENROUTER_KEY}';
const siteId = ctx.site?.id;
const memoryContext = ctx.memoryContext || 'No prior context.';
const MODEL = '${MODEL}';

const TOOLS = [
  { type: 'function', function: { name: 'list_files', description: 'List files matching a glob pattern', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'grep_search', description: 'Search for text inside files', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'read_file', description: 'Read file content', parameters: { type: 'object', properties: { path: { type: 'string' }, required: ['path'] } } } }
];

const runTool = async (name, input) => {
  if (!siteId) return 'No project selected';
  const headers = { 'Content-Type': 'application/json' };
  const opts = { json: true, ignoreHttpStatusErrors: true };
  try {
    if (name === 'list_files') {
      const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/search', headers, body: JSON.stringify({ siteId, pattern: input.pattern || '**/*', type: 'glob' }), ...opts });
      return (r?.matches || []).slice(0, 30).join('\\n') || 'No files found';
    }
    if (name === 'grep_search') {
      const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/search', headers, body: JSON.stringify({ siteId, pattern: input.pattern, type: 'grep' }), ...opts });
      return (r?.matches || []).slice(0, 20).join('\\n') || 'No matches found';
    }
    if (name === 'read_file') {
      const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/read', headers, body: JSON.stringify({ siteId, filePath: input.path }), ...opts });
      return r?.content ? r.content.slice(0, 4000) : 'File not found';
    }
  } catch (e) { return 'Error: ' + e.message; }
  return 'Unknown tool';
};

try {
  let messages = [
    { role: 'system', content: 'You are a helpful web development assistant with access to the project codebase.' },
    { role: 'user', content: \`Conversation history:\\n\${memoryContext}\\n\\nQuestion: \${ctx.message}\` }
  ];
  let output = '';
  
  for (let i = 0; i < 4; i++) {
    const r = await this.helpers.httpRequest({
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: { 'Authorization': 'Bearer ' + OPENROUTER_KEY, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://n8n.io' },
      body: JSON.stringify({ model: MODEL, messages, tools: siteId ? TOOLS : undefined, temperature: 0.7 }),
      timeout: 30000, json: true
    });
    
    // httpRequest with json:true returns body directly
    const choice = r.choices?.[0];
    const message = choice?.message;
    if (!message) break;
    
    messages.push(message);

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const tc of message.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments); } catch(e) {}
        const res = await runTool(tc.function.name, args);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: res });
      }
    } else {
      output = message.content || 'Done';
      break;
    }
  }
  
  console.log('💬 Question answered');
  return [{ json: { ...ctx, output, isDirectResponse: true, filesModified: [], iterations: 0 } }];
} catch (e) {
  console.error('Question error:', e.message);
  return [{ json: { ...ctx, output: 'Error: ' + e.message, isDirectResponse: true, iterations: 0 } }];
}`;

// 2.5 Agent 2: Planner (NEW MIGRATION)
const PLANNER_CODE = `// AGENT 2: PLANNER (OpenRouter - Gemini 3 Flash)
const ctx = $input.item.json;
const OPENROUTER_KEY = '${OPENROUTER_KEY}';
const MODEL = '${MODEL}';
const siteId = ctx.site?.id;
const githubToken = ctx.githubToken;

// Best-effort preview start (non-blocking)
const startPreview = async () => {
  if (!siteId) return;
  try {
    console.log('🚀 Sending preview start signal for ' + siteId);
    await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/start', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, repoUrl: ctx.site.repo_url, gitToken: githubToken }), timeout: 5000, ignoreHttpStatusErrors: true });
  } catch (e) { console.log('Preview start signal warning:', e.message); }
};
await startPreview();

console.log('🧠 Planner 3.0 active for:', ctx.message);

const TOOLS = [
  { type: 'function', function: { name: 'list_files_glob', description: 'List files matching a glob pattern', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'grep_search', description: 'Search for text inside files', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'read_file', description: 'Read file content', parameters: { type: 'object', properties: { path: { type: 'string' }, required: ['path'] } } } },
  { type: 'function', function: { name: 'finish_plan', description: 'Output the final execution plan', parameters: { type: 'object', properties: { summary: { type: 'string' }, tasks: { type: 'array', items: { type: 'object', properties: { id: { type: 'number' }, type: { type: 'string', enum: ['modify', 'create'] }, file: { type: 'string' }, description: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['id', 'type', 'file', 'description'] } }, complexity: { type: 'string', enum: ['low', 'medium', 'high'] } }, required: ['summary', 'tasks', 'complexity'] } } }
];

const runTool = async (name, args) => {
  if (!siteId) return 'Error: No siteId';
  const opts = { json: true, ignoreHttpStatusErrors: true };
  try {
    if (name === 'list_files_glob') {
      const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/search', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, pattern: args.pattern, type: 'glob' }), ...opts });
      return (r?.matches || []).slice(0, 50).join('\\n') || 'No files';
    }
    if (name === 'grep_search') {
      const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/search', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, pattern: args.pattern, type: 'grep' }), ...opts });
      return (r?.matches || []).slice(0, 20).join('\\n') || 'No matches found';
    }
    if (name === 'read_file') {
      const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/read', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, filePath: args.path }), ...opts });
      return (r?.content || '').slice(0, 4000);
    }
  } catch(e) { return 'Error: ' + e.message; }
  return 'Unknown tool';
};

let messages = [
  { role: 'system', content: 'You are a Senior Dev Planner. Goal: Create a precise JSON plan.' },
  { role: 'user', content: \`Request: \${ctx.message}\\n\\nMemory: \${ctx.memoryContext || ''}\` }
];

let plan = null, fileContents = {};

for (let i = 0; i < 4; i++) {
  try {
    const r = await this.helpers.httpRequest({
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: { 'Authorization': 'Bearer ' + OPENROUTER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, tools: TOOLS }),
      timeout: 60000, json: true
    });

    const msg = r.choices?.[0]?.message;
    if (!msg) break;
    messages.push(msg);

    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        let args = {}; try { args = JSON.parse(tc.function.arguments); } catch(e) {}
        if (tc.function.name === 'finish_plan') { plan = args; break; }
        const res = await runTool(tc.function.name, args);
        if (tc.function.name === 'read_file' && !res.startsWith('Error')) fileContents[args.path] = res;
        messages.push({ role: 'tool', tool_call_id: tc.id, content: res });
      }
      if (plan) break;
    } else break;
  } catch (e) { console.error('Planner error:', e.message); break; }
}

if (!plan) plan = { summary: 'Update: ' + ctx.message, tasks: [{ id: 1, type: 'modify', file: 'src/app/page.tsx', description: ctx.message }], complexity: 'low', fallback: true };

return [{ json: { ...ctx, plan, usedPlanner: true, fileContents } }];`;

// 3. Agent 3: Executor
const EXECUTOR_CODE = `// AGENT 3: EXECUTOR (OpenRouter - Gemini 3 Flash)
const ctx = $input.item.json;
const requestId = ctx.requestId;
const OPENROUTER_KEY = '${OPENROUTER_KEY}';
const MODEL = '${MODEL}';
const siteId = ctx.site?.id;
const githubToken = ctx.githubToken;

// Best-effort preview start (non-blocking)
const startPreview = async () => {
  if (!siteId) return;
  try {
    console.log('🚀 Sending preview start signal for ' + siteId);
    await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/start', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, repoUrl: ctx.site.repo_url, gitToken: githubToken }), timeout: 5000, ignoreHttpStatusErrors: true });
  } catch (e) { console.log('Preview start signal warning:', e.message); }
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
  if (name === 'list_files') { try { const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/search', headers, body: JSON.stringify({ siteId, pattern: input.pattern || '*', type: 'glob' }), ...opts }); return (r?.matches || []).slice(0, 30).join('\\n') || 'No files'; } catch (e) { return 'Error: ' + e.message; } }
  if (name === 'grep_search') { try { const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/search', headers, body: JSON.stringify({ siteId, pattern: input.pattern, type: 'grep' }), ...opts }); return (r?.matches || []).slice(0, 15).join('\\n') || 'No matches'; } catch (e) { return 'Error: ' + e.message; } }
  if (name === 'view_lines') { try { const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/read', headers, body: JSON.stringify({ siteId, filePath: input.file }), ...opts }); if (!r?.content) return 'File not found'; const lines = r.content.split('\\n'); const start = Math.max(0, (input.startLine || 1) - 1); const end = Math.min(lines.length, input.endLine || lines.length); return lines.slice(start, end).map((l, i) => (start + i + 1) + ': ' + l).join('\\n').slice(0, 3000); } catch (e) { return 'Error: ' + e.message; } }
  if (name === 'write_file') { try { const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/write', headers, body: JSON.stringify({ siteId, filePath: input.path, content: input.content, githubToken }), timeout: 60000, returnFullResponse: true, ...opts }); return r.statusCode >= 400 ? 'ERROR: ' + JSON.stringify(r.body) : '{\"success\":true,\"file\":\"' + input.path + '\",\"action\":\"created\"}'; } catch (e) { return 'ERROR: ' + e.message; } }
  if (name === 'str_replace') { try { const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/replace', headers, body: JSON.stringify({ siteId, filePath: input.file, search: input.old_text, replace: input.new_text, githubToken }), timeout: 60000, returnFullResponse: true, ...opts }); return r.statusCode >= 400 ? 'ERROR: ' + JSON.stringify(r.body) : '{\"success\":true,\"file\":\"' + input.file + '\",\"action\":\"replaced\"}'; } catch (e) { return 'ERROR: ' + e.message; } }
  if (name === 'generate_image') { try { const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions', headers: { 'Authorization': 'Bearer ' + OPENROUTER_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'google/gemini-2.5-flash-image-preview', messages: [{ role: 'user', content: input.prompt }] }), timeout: 45000, json: true });
      const content = r.choices?.[0]?.message?.content || '';
      const r1 = new RegExp('\\\\((https?://[^)]+)\\\\)');
      const r2 = new RegExp('(https?://[^\\\\s]+)');
      const urlMatch = content.match(r1) || content.match(r2);
      if (urlMatch) return JSON.stringify({ imageUrl: urlMatch[1] });
      return JSON.stringify({ imageUrl: 'https://placehold.co/800x600?text=Generation+Failed', fallback: true, debug: content.slice(0, 50) });
    } catch (e) { return 'ERROR: ' + e.message; }
  }
  return 'Unknown tool';
};

const plan = ctx.plan || {};
const tasks = plan.tasks || [];
const userRequest = ctx.message;
const preloadedFiles = Object.entries(ctx.fileContents || {}).map(([f, c]) => '=== ' + f + ' ===\\n' + c.slice(0, 1500)).join('\\n').slice(0, 4000);
let prompt = \`Expert Next.js dev. Rules: Minimal view_lines, write_file for new, no markdown in summary. Use <img> for external images (avoid next/image config issues).\\nUSER REQUEST: \${ctx.message}\\n\`;
if (tasks.length === 0) prompt += 'NEW PROJECT: create beautiful src/app/page.tsx\\n';
else { prompt += 'PLAN:\\n'; tasks.forEach((t, i) => prompt += \`\${i+1}. \${t.type} \${t.file}: \${t.description}\\n\`); if (preloadedFiles) prompt += \`\\nFILES:\\n\${preloadedFiles}\\n\`; }

let messages = [{ role: 'user', content: prompt }], output = '', steps = [], errors = 0;

for (let i = 0; i < 8; i++) {
  if (errors >= 2) { output = 'Too many errors'; break; }
  const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions', headers: { 'Authorization': 'Bearer ' + OPENROUTER_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, temperature: 0.2 }), timeout: 90000, json: true });
  const msg = r.choices?.[0]?.message;
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
}
return [{ json: { ...ctx, output, intermediateSteps: steps, iterations: steps.length } }];`;

// 4. Fast Executor
const FAST_EXECUTOR_CODE = `// FAST EXECUTOR (OpenRouter - Gemini 3 Flash)
const ctx = $input.item.json;
const OPENROUTER_KEY = '${OPENROUTER_KEY}';
const MODEL = '${MODEL}';
const siteId = ctx.site?.id;
const githubToken = ctx.githubToken;

// Best-effort preview start (non-blocking)
const startPreview = async () => {
  if (!siteId) return;
  try {
    console.log('🚀 Sending preview start signal for ' + siteId);
    await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/start', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, repoUrl: ctx.site.repo_url, gitToken: githubToken }), timeout: 5000, ignoreHttpStatusErrors: true });
  } catch (e) { console.log('Preview start signal warning:', e.message); }
};
await startPreview();

const TOOLS = [
  { type: 'function', function: { name: 'write_file', description: 'Write complete file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'str_replace', description: 'Replace text in file', parameters: { type: 'object', properties: { file: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['file', 'old_text', 'new_text'] } } }
];

const runTool = async (name, input) => {
  if (!siteId) return 'ERROR: No siteId';
  const headers = { 'Content-Type': 'application/json' };
  const opts = { json: true, ignoreHttpStatusErrors: true, returnFullResponse: true, timeout: 15000 };
  if (name === 'write_file') { const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/write', headers, body: JSON.stringify({ siteId, filePath: input.path, content: input.content, githubToken }), ...opts }); return r.statusCode >= 400 ? 'ERROR: ' + JSON.stringify(r.body) : JSON.stringify({ success: true, file: input.path, action: 'created' }); }
  if (name === 'str_replace') { const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/replace', headers, body: JSON.stringify({ siteId, filePath: input.file, search: input.old_text, replace: input.new_text, githubToken }), ...opts }); return r.statusCode >= 400 ? 'ERROR: ' + JSON.stringify(r.body) : JSON.stringify({ success: true, file: input.file, action: 'replaced' }); }
  return 'Unknown tool';
};

let messages = [{ role: 'user', content: 'Execute task quickly (Use <img> for external images, NOT next/image):\\\\n' + ctx.message }];
let output = '', steps = [];

for (let i = 0; i < 2; i++) {
  const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions', headers: { 'Authorization': 'Bearer ' + OPENROUTER_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, temperature: 0.2 }), timeout: 30000, json: true });
  const msg = r.choices?.[0]?.message;
  if (!msg) break;
  messages.push(msg);
  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      let args = {}; try { args = JSON.parse(tc.function.arguments); } catch(e) {}
      const res = await runTool(tc.function.name, args);
      steps.push({ tool: tc.function.name, input: args, result: res.slice(0, 150) });
      messages.push({ role: 'tool', tool_call_id: tc.id, content: res });
    }
  } else { output = msg.content || 'Done'; break; }
}
return [{ json: { ...ctx, output, intermediateSteps: steps, iterations: steps.length, usedPlanner: false } }];`;


// --- UPDATE NODES ---

let updated = 0;
workflow.nodes.forEach(node => {
  if (node.name === 'Agent 1: Intent Classifier') { node.parameters.jsCode = AGENT_1_CODE; updated++; }
  else if (node.name === 'Agent 2: Planner') { node.parameters.jsCode = PLANNER_CODE; updated++; }
  else if (node.name === 'Agent 3: Executor') { node.parameters.jsCode = EXECUTOR_CODE; updated++; }
  else if (node.name === 'Question Responder') { node.parameters.jsCode = QUESTION_RESPONDER_CODE; updated++; }
  else if (node.name === 'Fast Executor') { node.parameters.jsCode = FAST_EXECUTOR_CODE; updated++; }
});

fs.writeFileSync(outputFile, JSON.stringify(workflow, null, 2));
console.log(`Updated ${updated} nodes. Saved to ${outputFile}`);
