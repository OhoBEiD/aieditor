// HTTP-BASED COMPLEX EXECUTOR WITH ADVANCED TOOLS

const ctx = $input.item.json;
const ANTHROPIC_KEY = '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';
const MODEL = 'claude-sonnet-4-5-20250929';

// ADVANCED TOOL DEFINITIONS
const TOOLS = [
    // SEARCH TOOLS
    { name: 'grep_search', description: 'Exact text search in files', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    { name: 'fuzzy_search', description: 'Fuzzy search (handles typos, variations). Use if grep_search fails.', input_schema: { type: 'object', properties: { query: { type: 'string' }, threshold: { type: 'number', description: '0.0-1.0, default 0.6' } }, required: ['query'] } },

    // FILE OPERATIONS
    { name: 'read_file', description: 'Read file contents', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    { name: 'write_file', description: 'Create new file or overwrite existing', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
    { name: 'list_files', description: 'List directory contents', input_schema: { type: 'object', properties: { dir: { type: 'string' } }, required: ['dir'] } },

    // EDIT TOOLS (Choose based on edit size)
    { name: 'str_replace', description: 'Replace text (best for 1-2 line changes)', input_schema: { type: 'object', properties: { file: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['file', 'old_text', 'new_text'] } },
    { name: 'insert_lines', description: 'Insert code at line number (best for adding imports, new functions)', input_schema: { type: 'object', properties: { file: { type: 'string' }, line_number: { type: 'number' }, content: { type: 'string' } }, required: ['file', 'line_number', 'content'] } },
    { name: 'delete_lines', description: 'Delete lines by range', input_schema: { type: 'object', properties: { file: { type: 'string' }, start_line: { type: 'number' }, end_line: { type: 'number' } }, required: ['file', 'start_line', 'end_line'] } },

    // VERIFICATION TOOLS
    { name: 'run_command', description: 'Run shell command (npm run build, npm test, npx tsc)', input_schema: { type: 'object', properties: { command: { type: 'string', description: 'Allowed: npm run/test/install, npx tsc/eslint' } }, required: ['command'] } },
    { name: 'validate_syntax', description: 'Check TypeScript/JavaScript syntax', input_schema: { type: 'object', properties: { file: { type: 'string' } }, required: ['file'] }, cache_control: { type: 'ephemeral' } }
];

// INTELLIGENT SYSTEM PROMPT
const SYSTEM = [{
    type: 'text', text: `Expert code editor with advanced tools.

TOOL SELECTION RULES:
- SEARCH: Try grep_search first. If not found, try fuzzy_search.
- SMALL EDIT (1-2 lines): Use str_replace
- ADD CODE (imports, functions): Use insert_lines at specific line
- REMOVE CODE: Use delete_lines
- NEW FILE or LARGE CHANGE: Use write_file
- VERIFY AFTER EDIT: Use validate_syntax on modified files
- BUILD/TEST: Use run_command with npm commands

Be thorough but token-efficient. Verify changes work.`, cache_control: { type: 'ephemeral' }
}];

// HELPER: Levenshtein distance for fuzzy matching
const levenshtein = (a, b) => {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + cost);
        }
    }
    return matrix[b.length][a.length];
};

const similarity = (a, b) => {
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen;
};

// WHITELISTED COMMANDS
const ALLOWED_COMMANDS = ['npm run', 'npm test', 'npm install', 'npx tsc', 'npx eslint', 'npm run build', 'npm run dev', 'npm run lint'];

const executeTool = async (name, input) => {
    const siteId = ctx.site?.id;
    const githubToken = ctx.githubToken;

    // GREP SEARCH (exact match)
    if (name === 'grep_search') {
        const q = (input.query || '').toLowerCase();
        const results = [];
        for (const [f, c] of Object.entries(ctx.fileContents || {})) {
            c.split('\n').forEach((line, i) => {
                if (line.toLowerCase().includes(q)) results.push(f + ':' + (i + 1) + ': ' + line.trim().slice(0, 80));
            });
        }
        return results.length > 0 ? results.slice(0, 8).join('\n') : 'Not found. Try fuzzy_search.';
    }

    // FUZZY SEARCH (handles typos)
    if (name === 'fuzzy_search') {
        const q = (input.query || '').toLowerCase();
        const threshold = input.threshold || 0.6;
        const results = [];
        for (const [f, c] of Object.entries(ctx.fileContents || {})) {
            c.split('\n').forEach((line, i) => {
                const words = line.toLowerCase().split(/\s+/);
                for (const word of words) {
                    if (word.length > 3 && similarity(word, q) >= threshold) {
                        results.push({ score: similarity(word, q), match: f + ':' + (i + 1) + ': ' + line.trim().slice(0, 80) });
                        break;
                    }
                }
            });
        }
        results.sort((a, b) => b.score - a.score);
        return results.length > 0 ? results.slice(0, 5).map(r => r.match).join('\n') : 'Not found';
    }

    // STR_REPLACE (1-2 line changes)
    if (name === 'str_replace') {
        try {
            const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/replace', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, filePath: input.file, search: input.old_text, replace: input.new_text, githubToken }), timeout: 15000, json: true });
            if (r.ok || r.success || r.replaced) return JSON.stringify({ success: true, file: input.file, action: 'replaced' });
            return 'Error: ' + JSON.stringify(r);
        } catch (e) { return 'Error: ' + e.message; }
    }

    // INSERT_LINES (add code at specific line)
    if (name === 'insert_lines') {
        try {
            // Read current file, insert lines, write back
            let content = ctx.fileContents?.[input.file];
            if (!content) {
                const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/read', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, filePath: input.file, githubToken }), timeout: 10000, json: true });
                content = r.content || '';
            }
            const lines = content.split('\n');
            const insertAt = Math.max(0, Math.min(input.line_number - 1, lines.length));
            lines.splice(insertAt, 0, input.content);
            const newContent = lines.join('\n');
            const w = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/write', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, filePath: input.file, content: newContent, githubToken }), timeout: 20000, json: true });
            if (w.ok || w.success) return JSON.stringify({ success: true, file: input.file, action: 'inserted', at_line: input.line_number });
            return 'Error: ' + JSON.stringify(w);
        } catch (e) { return 'Error: ' + e.message; }
    }

    // DELETE_LINES (remove code range)
    if (name === 'delete_lines') {
        try {
            let content = ctx.fileContents?.[input.file];
            if (!content) {
                const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/read', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, filePath: input.file, githubToken }), timeout: 10000, json: true });
                content = r.content || '';
            }
            const lines = content.split('\n');
            const start = Math.max(0, input.start_line - 1);
            const end = Math.min(lines.length, input.end_line);
            lines.splice(start, end - start);
            const newContent = lines.join('\n');
            const w = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/write', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, filePath: input.file, content: newContent, githubToken }), timeout: 20000, json: true });
            if (w.ok || w.success) return JSON.stringify({ success: true, file: input.file, action: 'deleted', lines: start + 1 + '-' + end });
            return 'Error: ' + JSON.stringify(w);
        } catch (e) { return 'Error: ' + e.message; }
    }

    // READ_FILE
    if (name === 'read_file') {
        if (ctx.fileContents?.[input.path]) return ctx.fileContents[input.path].slice(0, 2000);
        try {
            const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/read', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, filePath: input.path, githubToken }), timeout: 10000, json: true });
            return (r.content || '').slice(0, 2000);
        } catch (e) { return 'Error: ' + e.message; }
    }

    // WRITE_FILE
    if (name === 'write_file') {
        try {
            const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/write', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, filePath: input.path, content: input.content, githubToken }), timeout: 20000, json: true });
            if (r.ok || r.success) return JSON.stringify({ success: true, file: input.path, action: 'created' });
            return 'Error: ' + JSON.stringify(r);
        } catch (e) { return 'Error: ' + e.message; }
    }

    // LIST_FILES
    if (name === 'list_files') {
        try {
            const r = await this.helpers.httpRequest({ method: 'GET', url: 'https://api.github.com/repos/' + ctx.owner + '/' + ctx.repo + '/contents/' + (input.dir || 'src') + '?ref=' + ctx.branch, headers: { 'Authorization': 'Bearer ' + githubToken }, timeout: 10000, json: true });
            return Array.isArray(r) ? r.map(f => f.path).join('\n') : 'Error';
        } catch (e) { return 'Error: ' + e.message; }
    }

    // RUN_COMMAND (whitelisted only)
    if (name === 'run_command') {
        const cmd = (input.command || '').trim();
        const isAllowed = ALLOWED_COMMANDS.some(allowed => cmd.startsWith(allowed));
        if (!isAllowed) return 'Error: Command not allowed. Use: npm run/test/install, npx tsc/eslint';
        try {
            const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/exec', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, command: cmd, githubToken, timeout: 30000 }), timeout: 35000, json: true });
            if (r.stdout || r.output) return (r.stdout || r.output).slice(0, 1000);
            if (r.stderr || r.error) return 'Error: ' + (r.stderr || r.error).slice(0, 500);
            return JSON.stringify(r).slice(0, 500);
        } catch (e) { return 'Error: ' + e.message + ' (exec endpoint may not exist)'; }
    }

    // VALIDATE_SYNTAX (TypeScript/JavaScript)
    if (name === 'validate_syntax') {
        try {
            // Try to run tsc on the file
            const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/exec', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, command: 'npx tsc --noEmit ' + input.file, githubToken, timeout: 20000 }), timeout: 25000, json: true });
            if (r.stdout && !r.stderr) return 'Syntax OK';
            if (r.stderr) return 'Syntax errors:\n' + r.stderr.slice(0, 500);
            return 'Syntax OK (no output)';
        } catch (e) {
            // Fallback: basic syntax check via regex
            const content = ctx.fileContents?.[input.file] || '';
            const issues = [];
            if ((content.match(/\{/g) || []).length !== (content.match(/\}/g) || []).length) issues.push('Mismatched braces');
            if ((content.match(/\(/g) || []).length !== (content.match(/\)/g) || []).length) issues.push('Mismatched parentheses');
            if ((content.match(/\[/g) || []).length !== (content.match(/\]/g) || []).length) issues.push('Mismatched brackets');
            return issues.length > 0 ? 'Potential issues: ' + issues.join(', ') : 'Basic syntax OK (full check unavailable)';
        }
    }

    return 'Unknown tool';
};

const callClaude = async (msgs) => {
    return await this.helpers.httpRequest({
        method: 'POST', url: 'https://api.anthropic.com/v1/messages',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: SYSTEM, tools: TOOLS, messages: msgs }),
        timeout: 90000, json: true
    });
};

const fileCtx = Object.entries(ctx.fileContents || {}).slice(0, 4).map(([f, c]) => f + ':\n' + c.slice(0, 2500)).join('\n---\n');
const memCtx = ctx.memoryContext ? '\nHISTORY:\n' + ctx.memoryContext : '';
const baseMsg = ctx.message + memCtx;
const fullMsg = baseMsg + (fileCtx ? '\n\nFILES:\n' + fileCtx : '');
const messages = [{ role: 'user', content: fullMsg }];
let output = ''; let steps = []; let i = 0;

while (i++ < 15) {
    const r = await callClaude(messages);
    if (r.usage) console.log('Cache:', { cached: r.usage.cache_read_input_tokens || 0, total: r.usage.input_tokens });
    const tool = r.content?.find(c => c.type === 'tool_use');
    if (!tool) { output = r.content?.find(c => c.type === 'text')?.text || 'Done'; break; }
    const result = await executeTool(tool.name, tool.input);
    steps.push({ tool: tool.name, input: tool.input, result: result.slice(0, 200) });
    messages.push({ role: 'assistant', content: r.content });
    messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: tool.id, content: result }] });

    // OPTIMIZATION: Prune file context after tool execution
    if (messages[0].content.length > baseMsg.length) {
        messages[0].content = baseMsg + '\n\n(Files pruned to save tokens)';
    }
}

return [{ json: { ...ctx, output, intermediateSteps: steps, iterations: i } }];
