// Fix n8n workflow tool context - USE $input.item.json instead of $('Merge Files')
// In AI Agent nodes, tools receive context through the input data, not previous nodes

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V15.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

// Tools that need fixing
const toolsToFix = ['list_files', 'read_file', 'write_file', 'str_replace_file', 'delete_file', 'search_files', 'add_dependency'];

console.log('🔧 Fixing tool context access...\n');

// Fix each tool to use $input.item.json instead of $('Merge Files')?.item?.json
workflow.nodes.forEach(node => {
    if (toolsToFix.includes(node.name) && node.parameters?.jsCode) {
        console.log(`Fixing tool: ${node.name}`);

        // Replace the context access pattern
        // The data flows INTO the Complex Executor from Complexity Router
        // So tools must use $input.item.json to access that data
        const oldPattern = /const ctx = \$\('Merge Files'\)\?\.\item\?\.\json \|\| \{\};/g;
        const newPattern = "const ctx = $input.item.json || {};";

        if (node.parameters.jsCode.includes("$('Merge Files')")) {
            node.parameters.jsCode = node.parameters.jsCode.replace(oldPattern, newPattern);
            console.log(`  ✓ Replaced $('Merge Files')?.item?.json with $input.item.json`);
        } else {
            console.log(`  ⚠️  Already uses $input pattern`);
        }
    }
});

// Write back the fixed workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 4));

console.log('\n✅ All tools fixed!');
console.log('📝 Tools now use $input.item.json to access context from Complexity Router');
console.log('🔄 Re-import the workflow into n8n to apply the changes.');
