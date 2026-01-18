// SIMPLE EXECUTOR V3 - Fixed multi-tool handling
const ctx = $input.item.json;
const ANTHROPIC_KEY = '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';
const MODEL = 'claude-haiku-4-5-20251001';

const TOOLS = [
    { name: 'write_file', description: 'Write complete file', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
    { name: 'str_replace', description: 'Replace text', input_schema: { type: 'object', properties: { file: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['file', 'old_text', 'new_text'] } }
];

const SYSTEM = 'Code editor. 1-2 calls max. write_file for changes, str_replace for single line. Files loaded below. Plain text response, brief.';

const executeTool = async (name, input) => {
    const siteId = ctx.site?.id;
    const githubToken = ctx.githubToken;
    if (!siteId) return 'ERROR: No siteId';

    if (name === 'write_file') {
        try {
            const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/write', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, filePath: input.path, content: input.content, githubToken }), timeout: 15000, json: true, ignoreHttpStatusErrors: true, returnFullResponse: true });
            if (r.statusCode >= 400) return 'ERROR: ' + JSON.stringify(r.body || r.statusCode);
            return JSON.stringify({ success: true, file: input.path, action: 'created' });
        } catch (e) { return 'ERROR: ' + e.message; }
    }

    if (name === 'str_replace') {
        try {
            const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/replace', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, filePath: input.file, search: input.old_text, replace: input.new_text, githubToken }), timeout: 15000, json: true, ignoreHttpStatusErrors: true, returnFullResponse: true });
            if (r.statusCode >= 400) return 'ERROR: ' + JSON.stringify(r.body || r.statusCode);
            return JSON.stringify({ success: true, file: input.file, action: 'replaced' });
        } catch (e) { return 'ERROR: ' + e.message; }
    }

    return 'Unknown tool';
};

const callClaude = async (msgs) => {
    try {
        const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://api.anthropic.com/v1/messages', headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, max_tokens: 1536, system: SYSTEM, tools: TOOLS, messages: msgs }), timeout: 60000, json: true, ignoreHttpStatusErrors: true, returnFullResponse: true });
        if (r.statusCode >= 400) return { error: r.body || r.statusCode };
        return r.body;
    } catch (e) { return { error: e.message }; }
};

const fileCtx = Object.entries(ctx.fileContents || {}).slice(0, 2).map(([f, c]) => f + ':\n' + c.slice(0, 1500)).join('\n---\n');
const baseMsg = ctx.message;
const fullMsg = baseMsg + (fileCtx ? '\n\nFILES:\n' + fileCtx : '');
const messages = [{ role: 'user', content: fullMsg }];
let output = ''; let steps = []; let i = 0;

while (i++ < 4) {
    const r = await callClaude(messages);
    if (r.error) { output = 'Error: ' + JSON.stringify(r.error); break; }
    if (r.usage) console.log('Tokens:', r.usage.input_tokens, r.usage.output_tokens);

    // Get ALL tool_use blocks, not just the first one
    const toolCalls = (r.content || []).filter(c => c.type === 'tool_use');

    // If no tool calls, get text response and exit
    if (toolCalls.length === 0) {
        output = r.content?.find(c => c.type === 'text')?.text || 'Done';
        break;
    }

    // Execute ALL tools and collect results
    const toolResults = [];
    for (const tool of toolCalls) {
        const result = await executeTool(tool.name, tool.input);
        steps.push({ tool: tool.name, input: tool.input, result: result.slice(0, 150) });
        toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: result });
    }

    // Push assistant message with all tool_use blocks
    messages.push({ role: 'assistant', content: r.content });
    // Push user message with ALL tool_results
    messages.push({ role: 'user', content: toolResults });

    // Prune context after first iteration
    if (messages[0].content.length > baseMsg.length) {
        messages[0].content = baseMsg + '\n(files pruned)';
    }
}

return [{ json: { ...ctx, output, intermediateSteps: steps, iterations: i } }];
