const fs = require('fs');

// Read V48
const workflow = JSON.parse(fs.readFileSync('./FIXED-AGENT-WORKFLOW-V48-ULTRA-OPTIMIZED.json', 'utf8'));

// Find and update Simple Executor
const simpleExecutor = workflow.nodes.find(n => n.name === 'Simple Executor');
if (simpleExecutor) {
  const code = simpleExecutor.parameters.jsCode;

  // Replace the message construction to be ultra-minimal
  const newCode = code.replace(
    /const memCtx = .*?\nconst messages = .*?\];/s,
    `// ULTRA-MINIMAL - Claude Code style (no upfront context)
const messages = [{ role: 'user', content: ctx.message }];`
  );

  simpleExecutor.parameters.jsCode = newCode;
  console.log('✅ Optimized Simple Executor');
}

// Find and update Complex Executor
const complexExecutor = workflow.nodes.find(n => n.name === 'Complex Executor');
if (complexExecutor) {
  const code = complexExecutor.parameters.jsCode;

  // Replace the message construction to be ultra-minimal
  const newCode = code.replace(
    /const memCtx = .*?\nconst messages = .*?\];/s,
    `// ULTRA-MINIMAL - Claude Code style (no upfront context)
const messages = [{ role: 'user', content: ctx.message }];`
  );

  complexExecutor.parameters.jsCode = newCode;
  console.log('✅ Optimized Complex Executor');
}

// Update system prompts to be more concise
if (simpleExecutor) {
  const code = simpleExecutor.parameters.jsCode;
  const newCode = code.replace(
    `const SYSTEM_TEXT = 'Fast code editor. grep->read->edit. Plain text only.';`,
    `const SYSTEM_TEXT = 'Code editor. Use tools to discover and edit files.';`
  );
  simpleExecutor.parameters.jsCode = newCode;
}

if (complexExecutor) {
  const code = complexExecutor.parameters.jsCode;
  const newCode = code.replace(
    `const SYSTEM_TEXT = \`You are a code editor using Claude Code-style tools.
WORKFLOW: 1) grep/glob to FIND 2) read_file with offset/limit 3) edit_file/multi_edit_file 4) write_file ONLY for new 5) run_command to verify
RULES: Search first. Keep reads small. edit_file fails if not unique. run_command only npm/pnpm/yarn test|lint|build. Plain text.\`;`,
    `const SYSTEM_TEXT = 'Code editor. Workflow: grep/glob→read→edit→verify. Search first, read minimal, edit precisely.';`
  );
  complexExecutor.parameters.jsCode = newCode;
}

// Save
fs.writeFileSync('./FIXED-AGENT-WORKFLOW-V48-ULTRA-OPTIMIZED.json', JSON.stringify(workflow, null, 2));
console.log('✅ Saved V48 ULTRA-OPTIMIZED');
console.log('\n📊 Token Optimization Summary:');
console.log('- Removed: repo name, branch, memory context from initial prompt');
console.log('- Reduced: system prompts to essential instructions only');
console.log('- Result: AI discovers everything via tools (true Claude Code style)');
