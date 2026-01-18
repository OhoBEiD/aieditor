// Revert the tools back to the original working version
const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V15.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

// Tools to revert
const toolsToRevert = ['list_files', 'read_file', 'write_file', 'str_replace_file', 'delete_file', 'search_files', 'add_dependency'];

// Revert back to original working pattern
workflow.nodes.forEach(node => {
    if (toolsToRevert.includes(node.name) && node.parameters?.jsCode) {
        console.log(`Reverting tool: ${node.name}`);

        // Revert to original pattern that was working
        node.parameters.jsCode = node.parameters.jsCode.replace(
            /const ctx = \$input\.first\(\)\.json \|\| \{\};/g,
            "const ctx = $('Merge Files')?.item?.json || {};"
        );

        console.log(`✓ Reverted ${node.name}`);
    }
});

// Write back
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 4));
console.log('\n✅ All tools reverted to original working version!');
console.log('Re-import the workflow into n8n.');
