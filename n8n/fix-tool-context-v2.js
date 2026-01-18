// Fix n8n workflow tool context access - REVERT the broken change
// The tools need to get context from the workflow execution, not from $input

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V15.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

// Tools that need fixing
const toolsToFix = ['list_files', 'read_file', 'write_file', 'str_replace_file', 'delete_file', 'search_files', 'add_dependency'];

// The correct way for AI tools to get context in n8n is via workflow execution context
// We need to use $execution to get data from previous nodes
workflow.nodes.forEach(node => {
    if (toolsToFix.includes(node.name) && node.parameters?.jsCode) {
        console.log(`Fixing tool: ${node.name}`);

        // Replace with the correct pattern for accessing execution context
        // In AI tool nodes, we use $execution.customData to access workflow context
        node.parameters.jsCode = node.parameters.jsCode.replace(
            /const ctx = \$input\.first\(\)\.json \|\| \{\};/g,
            "const ctx = this.getWorkflowStaticData('node');"
        );

        console.log(`✓ Fixed ${node.name}`);
    }
});

// Write back the fixed workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 4));
console.log('\n✅ Tools reverted. But we need a different approach - let me check the Complex Executor prompt...');
