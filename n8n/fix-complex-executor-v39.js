const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V38.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Fixing V39: Complex Executor API 400 Error\n');

// ========================================
// FIX: Update Complex Executor to not use beta features
// The 400 error is caused by the prompt-caching beta header
// ========================================
const complexExecutor = workflow.nodes.find(n => n.name === 'Complex Executor');
if (complexExecutor) {
    console.log('✅ Fixing Complex Executor - removing beta headers and cache_control');

    complexExecutor.parameters.jsCode = `// HTTP-BASED COMPLEX EXECUTOR V6 - Fixed API compatibility
const ctx = $input.item.json;
const ANTHROPIC_KEY = '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';
const MODEL = 'claude-sonnet-4-5-20250929';

const TOOLS = [
    { name: 'write_file', description: 'Write complete file. Use for any change.', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
    { name: 'str_replace', description: 'Single line swap only', input_schema: { type: 'object', properties: { file: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['file', 'old_text', 'new_text'] } },
    { name: 'list_files', description: 'List dir', input_schema: { type: 'object', properties: { dir: { type: 'string' } }, required: ['dir'] } },
    { name: 'read_file', description: 'Read file', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }
];

const SYSTEM = 'You are a code editor. CRITICAL: The FILES section below contains all project code ALREADY LOADED. DO NOT ask for files or code samples - USE THE FILES BELOW. Just use write_file to make changes. Complete in 1-2 tool calls. Reply plain text, no markdown, be brief.';

let consecutiveErrors = 0;

const executeTool = async (name, input) => {
    const siteId = ctx.site?.id;
    const githubToken = ctx.githubToken;
    if (!siteId) return 'FATAL: No siteId';

    if (name === 'str_replace') {
        try {
            const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/replace', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, filePath: input.file, search: input.old_text, replace: input.new_text, githubToken }), timeout: 15000, json: true, ignoreHttpStatusErrors: true, returnFullResponse: true });
            if (r.statusCode >= 400) { consecutiveErrors++; return 'ERROR: ' + JSON.stringify(r.body || r.statusCode); }
            consecutiveErrors = 0;
            return JSON.stringify({ success: true, file: input.file, action: 'replaced' });
        } catch (e) { consecutiveErrors++; return 'ERROR: ' + e.message; }
    }

    if (name === 'write_file') {
        try {
            const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/write', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, filePath: input.path, content: input.content, githubToken }), timeout: 20000, json: true, ignoreHttpStatusErrors: true, returnFullResponse: true });
            if (r.statusCode >= 400) { consecutiveErrors++; return 'ERROR: ' + JSON.stringify(r.body || r.statusCode); }
            consecutiveErrors = 0;
            return JSON.stringify({ success: true, file: input.path, action: 'created' });
        } catch (e) { consecutiveErrors++; return 'ERROR: ' + e.message; }
    }

    if (name === 'list_files') {
        try {
            const r = await this.helpers.httpRequest({ method: 'GET', url: 'https://api.github.com/repos/' + ctx.owner + '/' + ctx.repo + '/contents/' + (input.dir || 'src') + '?ref=' + ctx.branch, headers: { 'Authorization': 'Bearer ' + githubToken }, timeout: 10000, json: true });
            return Array.isArray(r) ? r.map(f => f.path).join('\\n') : 'Error';
        } catch (e) { return 'ERROR: ' + e.message; }
    }

    if (name === 'read_file') {
        if (ctx.fileContents?.[input.path]) return ctx.fileContents[input.path].slice(0, 3000);
        try {
            const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/read', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, filePath: input.path, githubToken }), timeout: 10000, json: true });
            return (r.content || '').slice(0, 3000);
        } catch (e) { return 'ERROR: ' + e.message; }
    }

    return 'Unknown tool';
};

const callClaude = async (msgs) => {
    try {
        const response = await this.helpers.httpRequest({ 
            method: 'POST', 
            url: 'https://api.anthropic.com/v1/messages', 
            headers: { 
                'x-api-key': ANTHROPIC_KEY, 
                'anthropic-version': '2023-06-01', 
                'content-type': 'application/json' 
            }, 
            body: JSON.stringify({ model: MODEL, max_tokens: 2048, system: SYSTEM, tools: TOOLS, messages: msgs }), 
            timeout: 90000, 
            json: true,
            ignoreHttpStatusErrors: true,
            returnFullResponse: true
        });
        if (response.statusCode >= 400) {
            console.error('Anthropic API error:', response.statusCode, JSON.stringify(response.body));
            return { error: response.body?.error?.message || response.body || response.statusCode };
        }
        return response.body;
    } catch (e) {
        console.error('Anthropic request failed:', e.message);
        return { error: e.message };
    }
};

const fileCtx = Object.entries(ctx.fileContents || {}).slice(0, 3).map(([f, c]) => f + ':\\n' + c.slice(0, 2000)).join('\\n---\\n');
const memCtx = ctx.memoryContext ? '\\nHISTORY:' + ctx.memoryContext : '';
const baseMsg = ctx.message + memCtx;
const fullMsg = baseMsg + (fileCtx ? '\\n\\nFILES:\\n' + fileCtx : '');
const messages = [{ role: 'user', content: fullMsg }];

let output = ''; let steps = []; let i = 0;

while (i++ < 6) {
    if (consecutiveErrors >= 2) { output = 'Stopped: errors.'; break; }
    const r = await callClaude(messages);
    if (r.error) { output = 'Error: ' + JSON.stringify(r.error); break; }
    if (r.usage) console.log('Tokens:', r.usage.input_tokens, 'out:', r.usage.output_tokens);
    const tool = r.content?.find(c => c.type === 'tool_use');
    if (!tool) { output = r.content?.find(c => c.type === 'text')?.text || 'Done'; break; }
    const result = await executeTool(tool.name, tool.input);
    steps.push({ tool: tool.name, input: tool.input, result: result.slice(0, 150) });
    if (result.startsWith('FATAL:')) { output = result; break; }
    messages.push({ role: 'assistant', content: r.content });
    messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: tool.id, content: result }] });
    if (messages[0].content.length > baseMsg.length) { messages[0].content = baseMsg + '\\n(files pruned)'; }
}

return [{ json: { ...ctx, output, intermediateSteps: steps, iterations: i } }];
`;
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V39.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ Created V39 - Fixed Complex Executor API call!');
console.log('📁 Saved to:', outputPath);
console.log('\n🔧 Fixes applied:');
console.log('  ✓ Removed anthropic-beta header (caused 400 error)');
console.log('  ✓ Removed cache_control from tools (not compatible without beta)');
console.log('  ✓ Changed system from array to string');
console.log('  ✓ Added better error logging');
console.log('  ✓ Increased max_tokens to 2048 and timeout to 90s');
