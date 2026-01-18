const fs = require('fs');

// Read the V15 workflow
const filePath = '/Users/omarobeid/Desktop/aieditor/n8n/FIXED-AGENT-WORKFLOW-V15.json';
const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// =============================================
// 1. Fix Merge Executor Results Node
// =============================================
const mergeNode = workflow.nodes.find(n => n.name === 'Merge Executor Results');
if (mergeNode) {
    // Force it to straightforward append mode
    mergeNode.parameters = {
        "mode": "append"
    };
    // Make sure typeVersion is compatible, usually 2 or 2.1 or 3 works, but 'append' is the key parameter for n8n-nodes-base.merge
    // If it's typeVersion 3, we might need specific "mode": "combine" and "combinationMode": "append" logic depending on n8n version,
    // but "mode": "append" is often safety-compatible or we switch to v2. 
    // Let's try specifying mode: append explicitly.
    mergeNode.typeVersion = 2.1;
}

// =============================================
// 2. Connect All Standard Tools to Simple Executor
// =============================================
const toolNodes = [
    'list_files',
    'read_file',
    'write_file',
    'str_replace_file',
    'delete_file',
    'search_files',
    'add_dependency',
    'locate_component'
];

// Ensure Simple Executor is an "ai_tool" parent for all these nodes
for (const toolName of toolNodes) {
    if (!workflow.connections[toolName]) {
        workflow.connections[toolName] = { "ai_tool": [] };
    }

    const connections = workflow.connections[toolName].ai_tool;
    const isConnected = connections.some(c => c.node === 'Simple Executor');

    if (!isConnected) {
        connections.push({
            "node": "Simple Executor",
            "type": "ai_tool",
            "index": 0
        });
        console.log(`Connected ${toolName} to Simple Executor`);
    }
}

// =============================================
// 3. Remove Duplicate "_simple" Tools
// =============================================
const simpleTools = ['list_files_simple', 'read_file_simple', 'str_replace_file_simple', 'write_file_simple'];

// Remove nodes
workflow.nodes = workflow.nodes.filter(n => !simpleTools.includes(n.name));

// Remove connections originating from these nodes (though tools usually don't originate main flows)
for (const tool of simpleTools) {
    delete workflow.connections[tool];
}

console.log('Removed duplicate _simple tools');

// =============================================
// 4. Clean up Simple Executor connections
// =============================================
// We need to ensure Simple Executor doesn't try to connect to the deleted nodes
// The connections are defined ON the tool nodes pointing TO the agent.
// Since we deleted the nodes and their entries in workflow.connections, we are good.

// But wait, the previous script might have added them to workflow.connections['list_files_simple'].
// We deleted that key above. So we are good.

// =============================================
// 5. Check Complexity Router Fallback
// =============================================
// Ensure default path goes to Complex Executor
// In Switch node, "fallbackOutput" controls where non-matching items go.
// Current setup: Output 0 = Simple, Output 1 = Complex.
// The router logic: if isComplex == false -> Output 0.
// if isComplex == true -> Output 1.
// We want fallback/default to be Output 1.

// We don't need to change the router logic itself if it correctly identifies simple vs complex.
// If valid JSON is not returned, the Parse Plan node defaults isComplex=true.
// So the flow naturally defaults to Complex.

// Write the updated workflow
fs.writeFileSync(filePath, JSON.stringify(workflow, null, 4));

console.log('✅ Worfklow updated: Merge fixed, Tools consolidated!');
