const fs = require('fs');

// Read the V15 workflow
const workflow = JSON.parse(fs.readFileSync('/Users/omarobeid/Desktop/aieditor/n8n/FIXED-AGENT-WORKFLOW-V15.json', 'utf8'));

// =============================================
// 1. Define locate_component tool (for Planning & Complex)
// =============================================
const locateComponentTool = {
    "parameters": {
        "name": "locate_component",
        "description": "Find components or functions by name. Input: component name (e.g., 'Header' or 'useAuth').",
        "jsCode": `const rawInput = $fromAI('query', 'Component name', 'string') || '';
let query = rawInput.trim();

if (query.startsWith('{')) {
  try { const p = JSON.parse(query); query = p.component || p.query || p.name || ''; } catch {}
}

if (!query) return 'Error: Component name required';

const ctx = $('Merge Files')?.item?.json || {};
const owner = ctx.owner;
const repo = ctx.repo;
const githubToken = ctx.githubToken;

if (!owner || !repo || !githubToken) return 'Error: No repository context';

try {
  // Search for the component definition
  const response = await this.helpers.httpRequest({
    method: 'GET',
    url: 'https://api.github.com/search/code?q=' + encodeURIComponent(query + ' repo:' + owner + '/' + repo),
    headers: {
      'Authorization': 'Bearer ' + githubToken,
      'Accept': 'application/vnd.github+json'
    },
    timeout: 10000
  });

  if (response.items && response.items.length > 0) {
    // Filter for likely definitions (files with the name)
    const matches = response.items.slice(0, 5).map(item => item.path);
    return 'Found likely matches:\\n' + matches.join('\\n');
  }
  return 'No components found matching: ' + query;
} catch (e) {
  return 'Error searching: ' + e.message;
}`
    },
    "id": "locate-component-tool",
    "name": "locate_component",
    "type": "@n8n/n8n-nodes-langchain.toolCode",
    "typeVersion": 1,
    "position": [2000, 850] // Add near Planning Agent tools
};

// =============================================
// 2. Define Verification Agent
// =============================================
const verificationSystemPrompt = `You are a Code Verification Agent.
Your job is to check the changes made by the execution agent.

## PREVIOUS PLAN
{plan}

## EXECUTION SUMMARY
{summary}

## FILES MODIFIED
{files}

## YOUR TASK
1. Verify if the files were actually modified
2. Check for syntax errors (visually)
3. Ensure the changes match the plan

If everything looks good, respond "VERIFIED: All changes look correct."
If there are issues, list them clearly.`;

const verificationAgentNode = {
    "parameters": {
        "promptType": "define",
        "text": "={{ 'Verify these changes:\\nPlan: ' + ($json.plan?.humanSummary || 'N/A') + '\\nFiles: ' + ($json.filesModified || []).join(', ') }}",
        "options": {
            "systemMessage": "={{ '" + verificationSystemPrompt.replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'.replace('{plan}', $json.plan?.humanSummary || '').replace('{summary}', $json.plan?.humanSummary || '').replace('{files}', ($json.filesModified || []).join(', ')) }}",
            "maxIterations": 5,
            "returnIntermediateSteps": true
        }
    },
    "id": "verification-agent-node",
    "name": "Verification Agent",
    "type": "@n8n/n8n-nodes-langchain.agent",
    "typeVersion": 1.7,
    "position": [2800, 500] // After Merge Executor Results
};

// =============================================
// 3. Add to workflow nodes
// =============================================
workflow.nodes.push(locateComponentTool, verificationAgentNode);

// =============================================
// 4. Update Connections
// =============================================

// Make Verification Agent intervene between Merge Results and Parse Results
// Remove: Merge Executor Results -> Parse Results
delete workflow.connections['Merge Executor Results'];

// New: Merge Executor Results -> Verification Agent -> Parse Results
workflow.connections['Merge Executor Results'] = {
    "main": [[{ "node": "Verification Agent", "type": "main", "index": 0 }]]
};

workflow.connections['Verification Agent'] = {
    "main": [[{ "node": "Parse Results", "type": "main", "index": 0 }]]
};

// Connect Claude Haiku to Verification Agent (reuse existing model node)
if (!workflow.connections['Claude Haiku']) { // Should already exist
    workflow.connections['Claude Haiku'] = { "ai_languageModel": [] };
}
workflow.connections['Claude Haiku'].ai_languageModel.push({
    "node": "Verification Agent",
    "type": "ai_languageModel",
    "index": 0
});


// Add locate_component tool to Planning Agent and Complex Executor
if (!workflow.connections['locate_component']) {
    workflow.connections['locate_component'] = { "ai_tool": [] };
}
workflow.connections['locate_component'].ai_tool.push(
    { "node": "Planning Agent", "type": "ai_tool", "index": 0 },
    { "node": "Complex Executor", "type": "ai_tool", "index": 0 }
);

// Add read_file and list_files to Verification Agent
workflow.connections['read_file'].ai_tool.push({ "node": "Verification Agent", "type": "ai_tool", "index": 0 });
workflow.connections['list_files'].ai_tool.push({ "node": "Verification Agent", "type": "ai_tool", "index": 0 });

// Move Parse Results and subsequent nodes to make room
const moveRight = 200;
const nodesToMove = ['Parse Results', 'Save Memory', 'Git Push', 'Git Pull', 'Save Request', 'Response'];

for (const node of workflow.nodes) {
    if (nodesToMove.includes(node.name)) {
        node.position[0] += moveRight;
    }
}

// Write the updated workflow
fs.writeFileSync('/Users/omarobeid/Desktop/aieditor/n8n/FIXED-AGENT-WORKFLOW-V15.json', JSON.stringify(workflow, null, 4));

console.log('✅ Added Verification Agent and locate_component tool!');
console.log('Nodes shifted right to accommodate new agent.');
