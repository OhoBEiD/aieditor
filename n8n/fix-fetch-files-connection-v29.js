const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V28.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Fixing Fetch Files connection - it needs input from Prepare Fetch!\n');

// The correct flow should be:
// Prepare Fetch → Fetch Files → Merge Files
// This way files actually get fetched before merging

// Update Prepare Fetch to connect to Fetch Files (not directly to Merge Files)
const prepareFetchConnections = workflow.connections['Prepare Fetch'];
if (prepareFetchConnections) {
  console.log('✅ Connecting: Prepare Fetch → Fetch Files');
  prepareFetchConnections.main = [
    [
      {
        "node": "Fetch Files",
        "type": "main",
        "index": 0
      }
    ]
  ];
}

// Update Fetch Files to connect to Merge Files
const fetchFilesConnections = workflow.connections['Fetch Files'];
if (fetchFilesConnections) {
  console.log('✅ Connecting: Fetch Files → Merge Files');
  fetchFilesConnections.main = [
    [
      {
        "node": "Merge Files",
        "type": "main",
        "index": 0
      }
    ]
  ];
} else {
  // Create the connection if it doesn't exist
  console.log('✅ Creating: Fetch Files → Merge Files connection');
  workflow.connections['Fetch Files'] = {
    "main": [
      [
        {
          "node": "Merge Files",
          "type": "main",
          "index": 0
        }
      ]
    ]
  };
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V29.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ Created V29 with correct Fetch Files connection!');
console.log('📁 Saved to:', outputPath);
console.log('\n🔧 Correct flow now:');
console.log('  1. Prepare Fetch → prepares list of files to fetch');
console.log('  2. Fetch Files → fetches the actual file contents');
console.log('  3. Merge Files → merges files into context');
console.log('\n💡 Now Fetch Files has proper input and will actually fetch files!');
