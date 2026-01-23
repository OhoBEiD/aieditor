// Optimize V51 workflow for faster execution:
// 1. Planner groups files instead of individual tasks
// 2. Executor writes multiple files per tool call
// 3. Reduce API timeout and iterations

const fs = require('fs');

const workflow = JSON.parse(fs.readFileSync('./FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json', 'utf8'));

// Find Agent 2: Planner
const plannerNode = workflow.nodes.find(n => n.name === 'Agent 2: Planner');
if (!plannerNode) {
    console.error('❌ Planner not found');
    process.exit(1);
}

// New optimized Planner code - groups files and reduces planning time
const newPlannerCode = `// AGENT 2: PLANNER - OPTIMIZED (Claude Sonnet 4.5)
// Groups files into logical batches instead of individual tasks
const ctx = $input.item.json;
const ANTHROPIC_KEY = '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';
const MODEL = 'claude-sonnet-4-5-20250929';

console.log('🧠 Planner (Optimized) active for:', ctx.message);

const TOOLS = [
  { name: 'list_files_glob', description: 'List files matching a glob pattern', input_schema: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } },
  { name: 'read_file', description: 'Read file content', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'finish_plan', description: 'Output the final execution plan with GROUPED tasks', input_schema: { 
    type: 'object', 
    properties: { 
      summary: { type: 'string', description: 'Human-readable summary of what will be built' }, 
      tasks: { 
        type: 'array', 
        description: 'Array of GROUPED tasks - group related files together, max 5 tasks total', 
        items: { 
          type: 'object', 
          properties: { 
            id: { type: 'number' }, 
            type: { type: 'string', enum: ['create_batch', 'modify_batch'], description: 'Task type - use batch operations' }, 
            files: { type: 'array', items: { type: 'string' }, description: 'List of files in this batch' },
            description: { type: 'string', description: 'What to do for all files in the batch' }
          }, 
          required: ['id', 'type', 'files', 'description'] 
        } 
      }, 
      complexity: { type: 'string', enum: ['low', 'medium', 'high'] } 
    }, 
    required: ['summary', 'tasks', 'complexity'] 
  }}
];

const runTool = async (name, args) => {
  // For WebContainer mode, we don't need to read files - just return guidance
  if (name === 'list_files_glob') {
    return 'No files yet - this is a new project in WebContainer.';
  }
  if (name === 'read_file') {
    return 'File does not exist - create it with the executor.';
  }
  return 'Unknown tool';
};

const SYSTEM = \`You are a Senior Dev Planner. Create a CONCISE execution plan with GROUPED tasks.

IMPORTANT RULES:
1. Group related files into BATCH tasks (max 5 tasks total)
2. For new projects, use this grouping:
   - Task 1: Config files (package.json, tsconfig.json, next.config.js, tailwind.config.ts, postcss.config.js)
   - Task 2: Base layout (app/layout.tsx, app/globals.css, app/page.tsx)  
   - Task 3: Main components (Header, Hero, main sections)
   - Task 4: Secondary components (Footer, additional sections)
   - Task 5: Data/types files if needed
3. Keep it simple - the Executor will handle the details
4. Use create_batch for new files, modify_batch for edits

Output format:
{
  "summary": "Brief human-readable summary",
  "tasks": [
    { "id": 1, "type": "create_batch", "files": ["file1.ts", "file2.ts"], "description": "Create these files" }
  ],
  "complexity": "low|medium|high"
}\`;

const userMsg = 'Request: ' + ctx.message + '\\n\\nExisting files: None (new WebContainer project)';
let plan = null;
let messages = [{ role: 'user', content: userMsg }];

// Single iteration - fast planning
try {
  const r = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: SYSTEM, tools: TOOLS, messages }),
    timeout: 30000, json: true
  });

  if (r.content) {
    for (const block of r.content) {
      if (block.type === 'tool_use' && block.name === 'finish_plan') {
        plan = block.input;
        break;
      }
    }
  }
} catch (e) { 
  console.error('Planner error:', e.message); 
}

// Fallback plan with grouped tasks
if (!plan) {
  plan = { 
    summary: 'Create: ' + ctx.message, 
    tasks: [
      { id: 1, type: 'create_batch', files: ['package.json', 'tsconfig.json', 'next.config.js', 'tailwind.config.ts'], description: 'Create config files' },
      { id: 2, type: 'create_batch', files: ['app/layout.tsx', 'app/globals.css', 'app/page.tsx'], description: 'Create base app structure' }
    ], 
    complexity: 'medium',
    fallback: true 
  };
}

console.log('📋 Plan created with', plan.tasks?.length || 0, 'batched tasks');
return [{ json: { ...ctx, plan, usedPlanner: true, fileContents: {} } }];`;

plannerNode.parameters.jsCode = newPlannerCode;
console.log('✅ Updated Planner - now groups files into batches');

// Update Executor to handle batch tasks efficiently
const executorNode = workflow.nodes.find(n => n.name === 'Agent 3: Executor');
if (executorNode) {
    // Update the prompt to work with batched tasks
    let code = executorNode.parameters.jsCode;

    // Update the prompt building to handle batch tasks
    code = code.replace(
        "let prompt = 'Expert Next.js dev. Rules: Use write_file for new files, str_replace for edits. Create beautiful modern UIs with Tailwind.\\\\nUSER REQUEST: ' + ctx.message + '\\\\n';",
        "let prompt = 'Expert Next.js dev. Create ALL files efficiently in parallel. Modern UIs with Tailwind. Use write_file for each file.\\\\nUSER REQUEST: ' + ctx.message + '\\\\n';"
    );

    // Update fallback creation
    code = code.replace(
        "if (tasks.length === 0) prompt += 'NEW PROJECT: Create files starting with src/app/page.tsx\\\\n';",
        "if (tasks.length === 0) prompt += 'NEW PROJECT: Create config files (package.json, tsconfig.json, etc) then app files.\\\\n';"
    );

    // Reduce max iterations from 10 to 6
    code = code.replace('for (let i = 0; i < 10; i++)', 'for (let i = 0; i < 6; i++)');

    // Reduce timeout from 90s to 60s
    code = code.replace('timeout: 90000', 'timeout: 60000');

    executorNode.parameters.jsCode = code;
    console.log('✅ Updated Executor - reduced iterations and timeout');
}

// Save
fs.writeFileSync('./FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json', JSON.stringify(workflow, null, 2));
console.log('✅ Saved optimized workflow');
console.log('');
console.log('📋 Changes made:');
console.log('  1. Planner now groups files into max 5 batch tasks');
console.log('  2. Executor uses reduced iterations (6 max)');
console.log('  3. Reduced API timeout (60s)');
console.log('');
console.log('⚠️  IMPORTANT: Import this workflow into n8n and activate it!');
