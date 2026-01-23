// Remove git push and sync preview nodes from V51 workflow
// These are no longer needed with WebContainers

const fs = require('fs');

const workflow = JSON.parse(fs.readFileSync('./FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json', 'utf8'));

// Nodes to remove (git push, sync preview, preview orchestrator calls)
const nodesToRemove = [
    'Git Push',
    'Push to GitHub',
    'Sync Preview',
    'Preview Sync',
    'Notify Preview',
    'Push Changes',
    'Commit Changes',
    'Trigger Preview Sync',
    'Preview Orchestrator',
];

const originalCount = workflow.nodes.length;

// Filter out the nodes
workflow.nodes = workflow.nodes.filter(node => {
    const shouldRemove = nodesToRemove.some(name =>
        node.name.toLowerCase().includes(name.toLowerCase())
    );
    if (shouldRemove) {
        console.log('🗑️  Removing node:', node.name);
    }
    return !shouldRemove;
});

// Also clean up connections to removed nodes
const remainingNodeNames = new Set(workflow.nodes.map(n => n.name));
for (const [sourceName, connections] of Object.entries(workflow.connections)) {
    if (!remainingNodeNames.has(sourceName)) {
        delete workflow.connections[sourceName];
        continue;
    }
    // Filter connections to remaining nodes only
    if (connections && connections.main) {
        for (let i = 0; i < connections.main.length; i++) {
            if (Array.isArray(connections.main[i])) {
                connections.main[i] = connections.main[i].filter(conn =>
                    remainingNodeNames.has(conn.node)
                );
            }
        }
    }
}

const removedCount = originalCount - workflow.nodes.length;
console.log(`\n✅ Removed ${removedCount} nodes`);
console.log(`📋 Remaining nodes: ${workflow.nodes.length}`);

// List remaining node names for verification
console.log('\n📋 Nodes in workflow:');
workflow.nodes.forEach(n => console.log('   -', n.name));

// Save
fs.writeFileSync('./FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json', JSON.stringify(workflow, null, 2));
console.log('\n✅ Saved workflow');
