const fs = require('fs');

const filePath = '/Users/omarobeid/Desktop/aieditor/n8n/FIXED-AGENT-WORKFLOW-V15.json';
const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Define the Agents
const COMPLEX_AGENT = 'Complex Executor';
const SIMPLE_AGENT = 'Simple Executor';
const PLANNING_AGENT = 'Planning Agent';

// Define Tools
const READ_TOOLS = ['list_files', 'read_file', 'search_files', 'locate_component'];
const WRITE_TOOLS = ['write_file', 'str_replace_file', 'delete_file', 'add_dependency'];

// Helper to ensure connection exists
function ensureConnection(toolName, agentName) {
    if (!workflow.connections[toolName]) {
        workflow.connections[toolName] = { ai_tool: [] };
    }

    // Check if connection already exists
    const exists = workflow.connections[toolName].ai_tool.some(c => c.node === agentName);

    if (!exists) {
        workflow.connections[toolName].ai_tool.push({
            node: agentName,
            type: 'ai_tool',
            index: 0
        });
        console.log(`Matched: ${toolName} -> ${agentName}`);
    } else {
        // console.log(`Exists: ${toolName} -> ${agentName}`);
    }
}

console.log('--- Fixing Connections ---');

// 1. Give ALL tools to Complex and Simple Executors
const ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];
for (const tool of ALL_TOOLS) {
    ensureConnection(tool, COMPLEX_AGENT);
    ensureConnection(tool, SIMPLE_AGENT);
}

// 2. Give ONLY read tools to Planning Agent
for (const tool of READ_TOOLS) {
    ensureConnection(tool, PLANNING_AGENT);
}

// 3. Verify no Write tools for Planning Agent
for (const tool of WRITE_TOOLS) {
    if (workflow.connections[tool]) {
        const initialLength = workflow.connections[tool].ai_tool.length;
        workflow.connections[tool].ai_tool = workflow.connections[tool].ai_tool.filter(c => c.node !== PLANNING_AGENT);
        if (workflow.connections[tool].ai_tool.length < initialLength) {
            console.log(`Removed unsafe ${tool} from Planning Agent`);
        }
    }
}

// 4. Update the actual JSON file
fs.writeFileSync(filePath, JSON.stringify(workflow, null, 4));
console.log('--- Done. JSON updated. ---');
