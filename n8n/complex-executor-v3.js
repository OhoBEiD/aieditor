// HTTP-BASED COMPLEX EXECUTOR - OPTIMIZED V2
// FIXES: 3-iteration limit, fail-fast, better error messages

const ctx = $input.item.json;
const ANTHROPIC_KEY = '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';
const MODEL = 'claude-sonnet-4-20250514';

// SIMPLIFIED TOOLS - Only what's reliable
const TOOLS = [
    { name: 'grep_search', description: 'Search text in loaded files', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    { name: 'str_replace', description: 'Replace text (1-2 lines)', input_schema: { type: 'object', properties: { file: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['file', 'old_text', 'new_text'] } },
    { name: 'write_file', description: 'Create/overwrite file', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
    { name: 'list_files', description: 'List directory', input_schema: { type: 'object', properties: { dir: { type: 'string' } }, required: ['dir'] }, cache_control: { type: 'ephemeral' } }
];

const SYSTEM = [{
    type: 'text',
    text: `Expert code editor. Complete task in 1-2 tool calls max.

IMPORTANT:
- Files are ALREADY LOADED in context. Check FILES section first!
- For simple changes: Use write_file with complete file content
- For text changes: Use str_replace with exact matching text
- If a tool fails, DO NOT retry. Report the error and stop.

Be extremely concise.`,
    cache_control: { type: 'ephemeral' }
}];

let consecutiveErrors = 0;

const executeTool = async (name, input) => {
    const siteId = ctx.site?.id;
    const githubToken = ctx.githubToken;

    if (!siteId) return 'FATAL: No siteId in context';

    // GREP SEARCH - in-memory only
    if (name === 'grep_search') {
        const q = (input.query || '').toLowerCase();
        const results = [];
        for (const [f, c] of Object.entries(ctx.fileContents || {})) {
            c.split('\n').forEach((line, i) => {
                if (line.toLowerCase().includes(q)) results.push(f + ':' + (i + 1) + ': ' + line.trim().slice(0, 60));
            });
        }
        return results.length > 0 ? results.slice(0, 5).join('\n') : 'Not found';
    }

    // STR_REPLACE
    if (name === 'str_replace') {
        try {
            const r = await this.helpers.httpRequest({
                method: 'POST',
                url: 'https://preview-orchestrator.fly.dev/preview/replace',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId, filePath: input.file, search: input.old_text, replace: input.new_text, githubToken }),
                timeout: 15000,
                json: true,
                ignoreHttpStatusErrors: true,
                returnFullResponse: true
            });

            if (r.statusCode >= 400) {
                consecutiveErrors++;
                const body = r.body;
                if (body?.error?.includes('Preview not running')) {
                    return 'FATAL: Preview not running. Cannot make changes.';
                }
                if (body?.error?.includes('not found in file')) {
                    return 'ERROR: Text not found. Use write_file with complete file content instead.';
                }
                return 'ERROR: ' + JSON.stringify(body || r.statusCode);
            }

            consecutiveErrors = 0;
            return JSON.stringify({ success: true, file: input.file });
        } catch (e) {
            consecutiveErrors++;
            return 'ERROR: ' + e.message;
        }
    }

    // WRITE_FILE
    if (name === 'write_file') {
        try {
            const r = await this.helpers.httpRequest({
                method: 'POST',
                url: 'https://preview-orchestrator.fly.dev/preview/write',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId, filePath: input.path, content: input.content, githubToken }),
                timeout: 20000,
                json: true,
                ignoreHttpStatusErrors: true,
                returnFullResponse: true
            });

            if (r.statusCode >= 400) {
                consecutiveErrors++;
                const body = r.body;
                if (body?.error?.includes('Preview not running')) {
                    return 'FATAL: Preview not running. Call /preview/start first.';
                }
                return 'ERROR: ' + JSON.stringify(body || r.statusCode);
            }

            consecutiveErrors = 0;
            return JSON.stringify({ success: true, file: input.path, action: 'created' });
        } catch (e) {
            consecutiveErrors++;
            return 'ERROR: ' + e.message;
        }
    }

    // LIST_FILES
    if (name === 'list_files') {
        try {
            const r = await this.helpers.httpRequest({
                method: 'GET',
                url: 'https://api.github.com/repos/' + ctx.owner + '/' + ctx.repo + '/contents/' + (input.dir || 'src') + '?ref=' + ctx.branch,
                headers: { 'Authorization': 'Bearer ' + githubToken },
                timeout: 10000,
                json: true
            });
            return Array.isArray(r) ? r.map(f => f.path).join('\n') : 'Error';
        } catch (e) {
            return 'ERROR: ' + e.message;
        }
    }

    return 'Unknown tool';
};

const callClaude = async (msgs) => {
    return await this.helpers.httpRequest({
        method: 'POST',
        url: 'https://api.anthropic.com/v1/messages',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 2048, system: SYSTEM, tools: TOOLS, messages: msgs }),
        timeout: 60000,
        json: true
    });
};

// Build context
const fileCtx = Object.entries(ctx.fileContents || {}).slice(0, 3).map(([f, c]) => f + ':\n```\n' + c.slice(0, 2000) + '\n```').join('\n\n');
const memCtx = ctx.memoryContext ? '\nHISTORY: ' + ctx.memoryContext : '';

const fullMsg = ctx.message + memCtx + (fileCtx ? '\n\nFILES:\n' + fileCtx : '');
const messages = [{ role: 'user', content: fullMsg }];

let output = '';
let steps = [];
let i = 0;

// MAX 15 ITERATIONS - fail fast on errors
while (i++ < 15) {
    // FAIL FAST: Stop if 2+ consecutive errors
    if (consecutiveErrors >= 2) {
        output = 'Stopped: Multiple consecutive errors. Check if preview is running.';
        break;
    }

    const r = await callClaude(messages);

    if (r.error) {
        output = 'API Error: ' + JSON.stringify(r.error);
        break;
    }

    if (r.usage) console.log('Tokens:', { input: r.usage.input_tokens, output: r.usage.output_tokens, cached: r.usage.cache_read_input_tokens || 0 });

    const tool = r.content?.find(c => c.type === 'tool_use');

    if (!tool) {
        output = r.content?.find(c => c.type === 'text')?.text || 'Done';
        break;
    }

    const result = await executeTool(tool.name, tool.input);
    steps.push({ tool: tool.name, input: tool.input, result: result.slice(0, 150) });

    // FAIL FAST: Stop on FATAL errors
    if (result.startsWith('FATAL:')) {
        output = result;
        break;
    }

    messages.push({ role: 'assistant', content: r.content });
    messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: tool.id, content: result }] });
}

return [{ json: { ...ctx, output, intermediateSteps: steps, iterations: i } }];
