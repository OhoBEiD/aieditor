const fs = require('fs');

// Read the V15 workflow
const workflow = JSON.parse(fs.readFileSync('/Users/omarobeid/Desktop/aieditor/n8n/FIXED-AGENT-WORKFLOW-V15.json', 'utf8'));

// List of read-only tools to add to Planning Agent
const readOnlyTools = ['read_file', 'search_files', 'list_files', 'locate_component'];

for (const toolName of readOnlyTools) {
    if (!workflow.connections[toolName]) {
        workflow.connections[toolName] = { "ai_tool": [] };
    }

    // Check if Planning Agent is already connected
    const isConnected = workflow.connections[toolName].ai_tool.some(conn => conn.node === 'Planning Agent');

    if (!isConnected) {
        workflow.connections[toolName].ai_tool.push({
            "node": "Planning Agent",
            "type": "ai_tool",
            "index": 0
        });
        console.log(`Added ${toolName} to Planning Agent`);
    } else {
        console.log(`${toolName} already connected to Planning Agent`);
    }
}

// Write the updated workflow
fs.writeFileSync('/Users/omarobeid/Desktop/aieditor/n8n/FIXED-AGENT-WORKFLOW-V15.json', JSON.stringify(workflow, null, 4));

console.log('✅ Planning Agent now has eyes! (Read/Search/List tools added)');
