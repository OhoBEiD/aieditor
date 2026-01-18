const fs = require('fs');
const workflow = JSON.parse(fs.readFileSync('FIXED-AGENT-WORKFLOW-V35.json', 'utf-8'));
const newCode = fs.readFileSync('simple-executor-v3.js', 'utf-8');

const simpleExec = workflow.nodes.find(n => n.name === 'Simple Executor');
if (simpleExec) {
  simpleExec.parameters.jsCode = newCode;
  console.log('Updated Simple Executor with V3');
}

fs.writeFileSync('FIXED-AGENT-WORKFLOW-V35.json', JSON.stringify(workflow, null, 2));
console.log('Saved workflow');
