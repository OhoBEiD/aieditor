// Modify V51 workflow to use WebContainers instead of fly.io
// Changes executor tool implementations to return file operations as JSON
// Frontend applies these via WebContainers

const fs = require('fs');

const workflow = JSON.parse(fs.readFileSync('./FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json', 'utf8'));

// Find Agent 3: Executor
const executorNode = workflow.nodes.find(n => n.name === 'Agent 3: Executor');
if (!executorNode) {
    console.error('❌ Agent 3: Executor not found');
    process.exit(1);
}

// New executor code that returns file operations instead of calling fly.io
const newExecutorCode = `// AGENT 3: EXECUTOR (OpenRouter - Gemini 3 Flash) - WEBCONTAINER MODE
// Returns file operations as JSON for frontend to apply via WebContainers
const ctx = $input.item.json;
const requestId = ctx.requestId;
const siteUuid = ctx.site?.uuid || 'unknown';
const OPENROUTER_KEY = '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';
const MODEL = 'google/gemini-3-flash-preview';
let stepCounter = 10;

// Collect file operations for frontend to apply
let fileOperations = [];

// Thinking step helper (still writes to Supabase for real-time updates)
const emitStep = async (toolName, status, message, details = {}) => {
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

await emitStep('planning', 'running', 'Creating execution plan...', { tasks: ctx.plan?.tasks?.length || 0 });

// Tools that return operations instead of executing them
const TOOLS = [
  { type: 'function', function: { name: 'list_files', description: 'List files in the project (reads from provided context)', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'view_lines', description: 'View file content (reads from provided context)', parameters: { type: 'object', properties: { file: { type: 'string' }, startLine: { type: 'number' }, endLine: { type: 'number' } }, required: ['file'] } } },
  { type: 'function', function: { name: 'write_file', description: 'Create or replace entire file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'str_replace', description: 'Replace exact text in file', parameters: { type: 'object', properties: { file: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['file', 'old_text', 'new_text'] } } },
  { type: 'function', function: { name: 'delete_file', description: 'Delete a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'generate_image', description: 'Generate AI image', parameters: { type: 'object', properties: { prompt: { type: 'string' }, fileName: { type: 'string' } }, required: ['prompt'] } } }
];

// Tool execution - returns JSON and collects operations
const runTool = async (name, input) => {
  // Read operations use context (from Planner's file reading)
  if (name === 'list_files') {
    await emitStep('list_files', 'running', 'Listing files: ' + (input.pattern || '*'));
    const files = Object.keys(ctx.fileContents || {});
    await emitStep('list_files', 'complete', 'Found ' + files.length + ' files in context');
    return files.length > 0 ? files.join('\\n') : 'No files in context. This is a new project - create files with write_file.';
  }
  
  if (name === 'view_lines') {
    await emitStep('read_file', 'running', 'Reading: ' + input.file);
    const content = ctx.fileContents?.[input.file];
    if (content) {
      await emitStep('read_file', 'complete', 'Read ' + input.file);
      const lines = content.split('\\n');
      const start = Math.max(0, (input.startLine || 1) - 1);
      const end = Math.min(lines.length, input.endLine || lines.length);
      return lines.slice(start, end).map((l, i) => (start + i + 1) + ': ' + l).join('\\n').slice(0, 3000);
    }
    await emitStep('read_file', 'complete', 'File not in context - will be created');
    return 'File not in context. Use write_file to create it.';
  }
  
  // Write operations - collect for frontend
  if (name === 'write_file') {
    await emitStep('write_file', 'running', 'Creating: ' + input.path);
    fileOperations.push({
      type: 'write',
      path: input.path,
      content: input.content
    });
    await emitStep('write_file', 'complete', 'Queued: ' + input.path);
    return JSON.stringify({ success: true, file: input.path, action: 'queued_for_write' });
  }
  
  if (name === 'str_replace') {
    await emitStep('str_replace', 'running', 'Modifying: ' + input.file);
    fileOperations.push({
      type: 'modify',
      path: input.file,
      oldText: input.old_text,
      newText: input.new_text
    });
    await emitStep('str_replace', 'complete', 'Queued modification: ' + input.file);
    return JSON.stringify({ success: true, file: input.file, action: 'queued_for_modify' });
  }
  
  if (name === 'delete_file') {
    await emitStep('delete_file', 'running', 'Deleting: ' + input.path);
    fileOperations.push({
      type: 'delete',
      path: input.path
    });
    await emitStep('delete_file', 'complete', 'Queued deletion: ' + input.path);
    return JSON.stringify({ success: true, file: input.path, action: 'queued_for_delete' });
  }
  
  if (name === 'generate_image') {
    await emitStep('generate_image', 'running', 'Generating image: ' + input.prompt?.substring(0, 50));
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
          model: 'google/gemini-2.5-flash-image',
          messages: [{ role: 'user', content: 'Generate an image: ' + input.prompt }]
        }),
        timeout: 60000,
        json: true
      });
      const message = r.choices?.[0]?.message;
      const content = message?.content;
      // Handle base64 images
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === 'image' && part.source?.type === 'base64') {
            const fileName = input.fileName || 'generated-' + Date.now() + '.png';
            const mediaType = part.source.media_type || 'image/png';
            fileOperations.push({
              type: 'write',
              path: 'public/images/' + fileName,
              content: 'data:' + mediaType + ';base64,' + part.source.data,
              isBase64: true
            });
            await emitStep('generate_image', 'complete', 'Generated: ' + fileName);
            return JSON.stringify({ imageUrl: '/images/' + fileName, success: true });
          }
        }
      }
      // Fallback placeholder
      await emitStep('generate_image', 'complete', 'Using placeholder');
      const placeholderText = encodeURIComponent(input.prompt?.substring(0, 40) || 'Image');
      return JSON.stringify({ imageUrl: 'https://placehold.co/800x600/2563eb/ffffff?text=' + placeholderText, fallback: true });
    } catch (e) {
      await emitStep('generate_image', 'error', 'Error: ' + e.message.substring(0, 50));
      return JSON.stringify({ error: e.message });
    }
  }
  
  return JSON.stringify({ error: 'Unknown tool' });
};

// Build prompt
const plan = ctx.plan || {};
const tasks = plan.tasks || [];
const preloadedFiles = Object.entries(ctx.fileContents || {}).map(([f, c]) => '=== ' + f + ' ===\\n' + c.slice(0, 1500)).join('\\n').slice(0, 4000);
let prompt = 'Expert Next.js dev. Rules: Use write_file for new files, str_replace for edits. Create beautiful modern UIs with Tailwind.\\nUSER REQUEST: ' + ctx.message + '\\n';
if (tasks.length === 0) prompt += 'NEW PROJECT: Create files starting with src/app/page.tsx\\n';
else { prompt += 'PLAN:\\n'; tasks.forEach((t, i) => prompt += (i+1) + '. ' + t.type + ' ' + t.file + ': ' + t.description + '\\n'); }
if (preloadedFiles) prompt += '\\nEXISTING FILES:\\n' + preloadedFiles + '\\n';

let messages = [{ role: 'user', content: prompt }], output = '', steps = [], errors = 0;

for (let i = 0; i < 10; i++) {
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
        if (res.includes('error')) iterErrors++;
      }
      errors = iterErrors > 0 ? errors + 1 : 0;
    } else { 
      output = msg.content || 'Done'; 
      break; 
    }
  } catch (e) {
    output = 'Fatal error: ' + e.message;
    break;
  }
}

await emitStep('complete', 'complete', 'Completed with ' + fileOperations.length + ' file operations');

// Return file operations for frontend to apply via WebContainers
return [{ 
  json: { 
    ...ctx, 
    output, 
    fileOperations,
    filesCreated: fileOperations.filter(o => o.type === 'write').map(o => o.path),
    filesModified: fileOperations.filter(o => o.type === 'modify').map(o => o.path),
    filesDeleted: fileOperations.filter(o => o.type === 'delete').map(o => o.path),
    intermediateSteps: steps, 
    iterations: steps.length,
    useWebContainer: true
  } 
}];`;

executorNode.parameters.jsCode = newExecutorCode;
console.log('✅ Updated Agent 3: Executor for WebContainer mode');

// Also update the Fast Executor if it exists
const fastExecutorNode = workflow.nodes.find(n => n.name === 'Fast Executor');
if (fastExecutorNode) {
    // Similar update for Fast Executor
    const fastExecutorCode = `// FAST EXECUTOR - WEBCONTAINER MODE
const ctx = $input.item.json;
const OPENROUTER_KEY = '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';
const MODEL = 'google/gemini-3-flash-preview';
let fileOperations = [];

const TOOLS = [
  { type: 'function', function: { name: 'write_file', description: 'Create/replace file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'str_replace', description: 'Replace text in file', parameters: { type: 'object', properties: { file: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['file', 'old_text', 'new_text'] } } }
];

const runTool = (name, input) => {
  if (name === 'write_file') {
    fileOperations.push({ type: 'write', path: input.path, content: input.content });
    return JSON.stringify({ success: true, action: 'queued' });
  }
  if (name === 'str_replace') {
    fileOperations.push({ type: 'modify', path: input.file, oldText: input.old_text, newText: input.new_text });
    return JSON.stringify({ success: true, action: 'queued' });
  }
  return '{}';
};

const files = Object.entries(ctx.fileContents || {}).map(([f, c]) => '=== ' + f + ' ===\\n' + c.slice(0, 2000)).join('\\n');
let messages = [{ role: 'user', content: 'Expert Next.js dev. Make this change: ' + ctx.message + '\\n\\nFILES:\\n' + files }];
let output = '', steps = [];

for (let i = 0; i < 5; i++) {
  const r = await this.helpers.httpRequest({ 
    method: 'POST', 
    url: 'https://openrouter.ai/api/v1/chat/completions', 
    headers: { 'Authorization': 'Bearer ' + OPENROUTER_KEY, 'HTTP-Referer': 'https://n8n.io', 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, temperature: 0.2 }), 
    timeout: 60000, json: true 
  });
  const msg = r.choices?.[0]?.message;
  if (!msg) break;
  messages.push(msg);
  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      let args = {}; try { args = JSON.parse(tc.function.arguments); } catch(e) {}
      const res = runTool(tc.function.name, args);
      steps.push({ tool: tc.function.name, input: args });
      messages.push({ role: 'tool', tool_call_id: tc.id, content: res });
    }
  } else { output = msg.content || 'Done'; break; }
}

return [{ json: { ...ctx, output, fileOperations, filesCreated: fileOperations.filter(o => o.type === 'write').map(o => o.path), filesModified: fileOperations.filter(o => o.type === 'modify').map(o => o.path), intermediateSteps: steps, useWebContainer: true } }];`;

    fastExecutorNode.parameters.jsCode = fastExecutorCode;
    console.log('✅ Updated Fast Executor for WebContainer mode');
}

// Save
fs.writeFileSync('./FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json', JSON.stringify(workflow, null, 2));
console.log('✅ Saved FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json');
console.log('📋 Re-import into n8n to use WebContainer mode');
console.log('');
console.log('Changes made:');
console.log('  - Tools now return file operations as JSON (queued)');
console.log('  - Response includes fileOperations array for frontend');
console.log('  - Frontend applies changes via WebContainers');
console.log('  - Removed fly.io preview-orchestrator calls');
