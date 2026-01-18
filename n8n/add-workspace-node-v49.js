// Add "Ensure Workspace Exists" node to V48 workflow
const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V48-ULTRA-OPTIMIZED.json');
const outputFile = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V49-WORKSPACE-FIX.json');

// Read workflow
const workflow = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

// New node definition
const newNode = {
  "parameters": {
    "jsCode": "// ENSURE WORKSPACE EXISTS\nconst ctx = $input.item.json;\nconst siteId = ctx.site?.id;\nconst githubToken = ctx.githubToken;\nconst repoUrl = ctx.site?.repo_url;\n\nif (!siteId) {\n  console.log('⚠️ No siteId, skipping workspace setup');\n  return [{ json: ctx }];\n}\n\ntry {\n  // Check if workspace exists\n  const status = await this.helpers.httpRequest({\n    method: 'GET',\n    url: 'https://preview-orchestrator.fly.dev/preview/status/' + siteId,\n    timeout: 3000,\n    json: true,\n    ignoreHttpStatusErrors: true\n  });\n  \n  // If not running, start it (this clones the repo)\n  if (!status || status.status !== 'running') {\n    console.log('🔧 Workspace not found, cloning repo...');\n    await this.helpers.httpRequest({\n      method: 'POST',\n      url: 'https://preview-orchestrator.fly.dev/preview/start',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({ siteId, repoUrl, gitToken: githubToken }),\n      timeout: 30000,\n      ignoreHttpStatusErrors: true\n    });\n    await new Promise(r => setTimeout(r, 2000)); // Wait for clone\n    console.log('✅ Workspace ready');\n  } else {\n    console.log('✅ Workspace already running');\n  }\n} catch (e) {\n  console.error('⚠️ Workspace setup error:', e.message);\n}\n\nreturn [{ json: ctx }];"
  },
  "id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
  "name": "Ensure Workspace Exists",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [-11288, 6864]
};

// Insert new node after "Build Context" in nodes array
const buildContextIndex = workflow.nodes.findIndex(n => n.id === "8f0a1653-b076-45f0-99e9-5335a1b0d6c7");
workflow.nodes.splice(buildContextIndex + 1, 0, newNode);

// Update connections: Build Context -> Ensure Workspace Exists -> Fetch Memory
// Find Build Context connections
const buildContextId = "8f0a1653-b076-45f0-99e9-5335a1b0d6c7";
const newNodeId = "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d";
const fetchMemoryId = "7d48508d-3c8f-465c-89d1-f6a69ba57316";

// Update Build Context to point to new node
workflow.connections["Build Context"] = {
  "main": [[{
    "node": "Ensure Workspace Exists",
    "type": "main",
    "index": 0
  }]]
};

// Add new node connections to Fetch Memory
workflow.connections["Ensure Workspace Exists"] = {
  "main": [[{
    "node": "Fetch Memory",
    "type": "main",
    "index": 0
  }]]
};

// Write output
fs.writeFileSync(outputFile, JSON.stringify(workflow, null, 2));
console.log('✅ Created V49 workflow with "Ensure Workspace Exists" node');
console.log('📍 New node inserted between "Build Context" and "Fetch Memory"');
console.log('📄 Output:', outputFile);
