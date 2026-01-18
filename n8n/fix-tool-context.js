// Fix n8n workflow tool context access
// This script fixes all tools to use $input.first() instead of $('Merge Files')?.item?.json

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V15.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

// Tools that need fixing
const toolsToFix = ['list_files', 'read_file', 'write_file', 'str_replace_file', 'delete_file', 'search_files', 'add_dependency'];

// Fix each tool
workflow.nodes.forEach(node => {
    if (toolsToFix.includes(node.name) && node.parameters?.jsCode) {
        console.log(`Fixing tool: ${node.name}`);

        // Replace the problematic context access pattern
        node.parameters.jsCode = node.parameters.jsCode.replace(
            /const ctx = \$\('Merge Files'\)\?\.item\?\.json \|\| \{\};/g,
            "const ctx = $input.first().json || {};"
        );

        console.log(`✓ Fixed ${node.name}`);
    }
});

// Write back the fixed workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 4));
console.log('\n✅ All tools fixed! Re-import the workflow into n8n.');
