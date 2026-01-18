// Update Gemini API key in V49 workflow
const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V49-WORKSPACE-FIX.json');
const outputFile = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V49-WORKSPACE-FIX.json');

// Read workflow
const workflow = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

const OLD_KEY = 'AIzaSyAOViIkqaut_PjUSNB49QjPk-_zWbOGvUw';
const NEW_KEY = 'AIzaSyDl64uR_PMDtc6VcEzunvpTGdnb2RRLcXI';

let replacementCount = 0;

// Update all nodes that have jsCode with Gemini API key
workflow.nodes.forEach(node => {
  if (node.parameters?.jsCode) {
    const oldCode = node.parameters.jsCode;
    const newCode = oldCode.replace(new RegExp(OLD_KEY, 'g'), NEW_KEY);

    if (oldCode !== newCode) {
      node.parameters.jsCode = newCode;
      const matches = (oldCode.match(new RegExp(OLD_KEY, 'g')) || []).length;
      console.log(`✅ Updated ${matches}x in node: ${node.name}`);
      replacementCount += matches;
    }
  }
});

// Write output
fs.writeFileSync(outputFile, JSON.stringify(workflow, null, 2));
console.log(`\n🔑 Total API key replacements: ${replacementCount}`);
console.log('📄 Updated file:', outputFile);
