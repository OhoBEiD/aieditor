const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V32.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Fixing V33: Planning Agent invalid syntax error\n');

// ========================================
// FIX: Correct Planning Agent system message syntax
// ========================================
const planningAgent = workflow.nodes.find(n => n.name === 'Planning Agent');
if (planningAgent) {
  console.log('✅ Fixing Planning Agent system message syntax');

  // The problem: using JavaScript string concatenation in n8n expression
  // The solution: Single expression string that n8n can evaluate
  planningAgent.parameters.options.systemMessage =
    '={{ "P:" + $json.owner + "/" + $json.repo + "|F:" + Object.keys($json.fileContents||{}).join(",") + "|R:SIMPLE=1file+text/style|COMPLEX=multi-file/api/state|OUT:{isComplex:bool,confidence:0-1,plan:{summary:str,tasks:[{id,task,status}]}}|M:" + ($json.memoryContext||"none").slice(0,100) }}';
}

// ========================================
// FIX: Correct executor system messages
// ========================================
const complexExecutor = workflow.nodes.find(n => n.name === 'Complex Executor');
if (complexExecutor) {
  console.log('✅ Fixing Complex Executor system message syntax');

  complexExecutor.parameters.options.systemMessage =
    '={{ $json.owner + "/" + $json.repo + "|T:" + ($json.executionPlan?.tasks ? $json.executionPlan.tasks.map(t=>t.id+"."+t.task.slice(0,20)).join("|") : "exec") + "|LOADED:" + Object.keys($json.fileContents||{}).join(",") + "|R:1tool/call|grep>read|str_replace needs exact match|NO read files in LOADED|OUT:plain English no markdown/emoji|M:" + ($json.memoryContext||"none").slice(0,100) }}';
}

const simpleExecutor = workflow.nodes.find(n => n.name === 'Simple Executor');
if (simpleExecutor) {
  console.log('✅ Fixing Simple Executor system message syntax');

  simpleExecutor.parameters.options.systemMessage =
    '={{ $json.owner + "/" + $json.repo + "|T:" + ($json.executionPlan?.tasks ? $json.executionPlan.tasks.map(t=>t.id+"."+t.task.slice(0,15)).join("|") : "exec") + "|LOADED:" + Object.keys($json.fileContents||{}).join(",") + "|R:grep>read|NO read LOADED files|str_replace exact|OUT:plain text only|M:" + ($json.memoryContext||"none").slice(0,80) }}';
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V33.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ Created V33 - Fixed syntax errors!');
console.log('📁 Saved to:', outputPath);
console.log('\n🔧 Fixes applied:');
console.log('  ✓ Planning Agent: Fixed string concatenation syntax');
console.log('  ✓ Complex Executor: Fixed string concatenation syntax');
console.log('  ✓ Simple Executor: Fixed string concatenation syntax');
console.log('\n💡 All system messages now use single n8n expression strings');
console.log('  - No more JavaScript + operators breaking n8n parser');
console.log('  - All concatenation happens inside the {{ }} expression');
console.log('\n🎯 V33 = V32 (memory-aware grep) + syntax fixes');
