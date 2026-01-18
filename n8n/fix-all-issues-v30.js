const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V29.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Fixing V30: grep_search + clean output + smart tool usage\n');

// ========================================
// FIX 1: Update Planning Agent to ONLY use tools when needed
// ========================================
const planningAgent = workflow.nodes.find(n => n.name === 'Planning Agent');
if (planningAgent) {
  console.log('✅ Updating Planning Agent system prompt - minimize tool usage');

  const currentSystemMsg = planningAgent.parameters.options.systemMessage;

  // Replace the system message to discourage unnecessary tool calls
  const newSystemMsg = currentSystemMsg
    .replace(
      '## AVAILABLE FILES\n{fileList}',
      '## AVAILABLE FILES\n{fileList}\n\n⚠️ DO NOT call list_files, get_file_tree, or grep_search unless the user EXPLICITLY asks for file structure or search.\n⚠️ For simple text changes, just create the plan - DO NOT waste time browsing files.'
    );

  planningAgent.parameters.options.systemMessage = newSystemMsg;
}

// ========================================
// FIX 2: Update executor system prompts for CLEAN plain English output
// ========================================
const complexExecutor = workflow.nodes.find(n => n.name === 'Complex Executor');
if (complexExecutor) {
  console.log('✅ Updating Complex Executor - clean output format');

  let systemMsg = complexExecutor.parameters.options.systemMessage;

  // Add output format rules at the end
  if (!systemMsg.includes('OUTPUT FORMAT')) {
    systemMsg += '\n\nOUTPUT FORMAT:\n- Use plain English sentences\n- NO markdown (no **, ~~, `, #)\n- NO code blocks\n- NO emojis (✅❌🔥 etc)\n- Keep it conversational\nExample: "I changed the title in page.tsx from omar obeid to omar ai services."';
  }

  complexExecutor.parameters.options.systemMessage = systemMsg;
}

const simpleExecutor = workflow.nodes.find(n => n.name === 'Simple Executor');
if (simpleExecutor) {
  console.log('✅ Updating Simple Executor - clean output format');

  let systemMsg = simpleExecutor.parameters.options.systemMessage;

  // Add output format rules
  if (!systemMsg.includes('OUTPUT FORMAT')) {
    systemMsg += '\n\nOUTPUT FORMAT:\n- Plain English only\n- NO markdown or code formatting\n- NO emojis\n- Be brief and clear\nExample: "Changed the text to omar ai services in the main page file."';
  }

  simpleExecutor.parameters.options.systemMessage = systemMsg;
}

// ========================================
// FIX 3: Debug grep_search - add better error handling
// ========================================
const grepSearchNode = workflow.nodes.find(n => n.name === 'grep_search');
if (grepSearchNode) {
  console.log('✅ Adding debug logging to grep_search');

  // Update grep_search to log the actual queries being sent
  grepSearchNode.parameters.jsCode = grepSearchNode.parameters.jsCode.replace(
    'const strategies = [',
    `console.log('🔍 grep_search DEBUG: owner=' + owner + ', repo=' + repo + ', searchText=' + searchText);
  const strategies = [`
  );
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V30.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ Created V30 with all fixes!');
console.log('📁 Saved to:', outputPath);
console.log('\n🔧 Key fixes:');
console.log('  1. Planning Agent: Only uses tools when user explicitly asks');
console.log('  2. Planning Agent: Won\'t call list_files/get_file_tree for simple tasks');
console.log('  3. Executors: Output plain English - NO markdown, emojis, or code blocks');
console.log('  4. grep_search: Added debug logging to diagnose search issues');
console.log('\n💡 Test with: "change omar obeid to omar ai services"');
console.log('  Expected: Clean output like "Changed the title from omar obeid to omar ai services"');
