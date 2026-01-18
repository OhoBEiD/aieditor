const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V27.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Fixing planner tool connections - it should NOT have read_file!\\n');

// Find all tool nodes that connect to Planning Agent
const toolsToDisconnect = ['read_file', 'write_file', 'str_replace_file', 'delete_file',
                            'add_dependency', 'generate_image', 'fetch_stock_image',
                            'create_component', 'add_page', 'run_build',
                            'create_checkpoint', 'rollback'];

const plannerOnlyTools = ['list_files', 'search_files', 'get_file_tree', 'grep_search'];

console.log('✅ Removing write/read tools from Planning Agent');
console.log('✅ Planning Agent will ONLY have:', plannerOnlyTools.join(', '));

// Update all tool connections to remove Planning Agent
for (const toolName of toolsToDisconnect) {
  const toolNode = workflow.nodes.find(n => n.name === toolName);
  if (toolNode) {
    // Find this tool's connections
    const connectionKey = Object.keys(workflow.connections).find(k => k === toolName);
    if (connectionKey && workflow.connections[connectionKey]?.ai_tool) {
      const aiToolConnections = workflow.connections[connectionKey].ai_tool[0];

      // Remove Planning Agent from connections
      const filteredConnections = aiToolConnections.filter(conn => conn.node !== 'Planning Agent');

      if (filteredConnections.length !== aiToolConnections.length) {
        console.log('  ✓ Removed Planning Agent from:', toolName);
        workflow.connections[connectionKey].ai_tool[0] = filteredConnections;
      }
    }
  }
}

// Ensure planner-only tools ARE connected to Planning Agent
console.log('\\n✅ Ensuring Planning Agent HAS these tools:');
for (const toolName of plannerOnlyTools) {
  const connectionKey = Object.keys(workflow.connections).find(k => k === toolName);
  if (connectionKey && workflow.connections[connectionKey]?.ai_tool) {
    const aiToolConnections = workflow.connections[connectionKey].ai_tool[0];

    // Check if Planning Agent is in connections
    const hasPlanningAgent = aiToolConnections.some(conn => conn.node === 'Planning Agent');

    if (hasPlanningAgent) {
      console.log('  ✓', toolName, '-> Planning Agent (already connected)');
    } else {
      console.log('  + Adding', toolName, '-> Planning Agent');
      aiToolConnections.push({
        "node": "Planning Agent",
        "type": "ai_tool",
        "index": 0
      });
    }
  }
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V28.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\\n✅ Created V28 with correct planner tools!');
console.log('📁 Saved to:', outputPath);
console.log('\\n🔧 Planning Agent tools:');
console.log('  ✅ list_files - see what files exist');
console.log('  ✅ search_files - search for code patterns');
console.log('  ✅ get_file_tree - see project structure');
console.log('  ✅ grep_search - find text quickly');
console.log('\\n🚫 Planning Agent does NOT have:');
console.log('  ❌ read_file - executors will handle this');
console.log('  ❌ write_file, str_replace_file - executors only');
console.log('  ❌ create_component, add_dependency - executors only');
console.log('\\n💡 This prevents the planner from wasting tokens on file reads!');
