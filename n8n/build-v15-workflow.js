const fs = require('fs');

// Read the V15 workflow
const workflow = JSON.parse(fs.readFileSync('/Users/omarobeid/Desktop/aieditor/n8n/FIXED-AGENT-WORKFLOW-V15.json', 'utf8'));

// Position reference: Fetch Memory is at [42864, 1632], AI Agent at [42944, 1632]
// We'll insert new nodes between them

// =============================================
// 1. Add Claude Haiku Model Node (for Planning)
// =============================================
const claudeHaikuNode = {
    "parameters": {
        "model": {
            "__rl": true,
            "value": "claude-3-5-haiku-20241022",
            "mode": "list"
        },
        "options": {
            "maxTokensToSample": 2048,
            "temperature": 0.1
        }
    },
    "id": "haiku-model-planning",
    "name": "Claude Haiku",
    "type": "@n8n/n8n-nodes-langchain.lmChatAnthropic",
    "typeVersion": 1.3,
    "position": [42920, 2320],
    "credentials": {
        "anthropicApi": {
            "id": "cR1eoa32avbXUEse",
            "name": "Anthropic account"
        }
    }
};

// =============================================
// 2. Add Planning Agent Node
// =============================================
const planningAgentSystemPrompt = `You are a Planning Agent for AutoMate, an AI code editor.
Your job is to analyze user requests and create an execution plan.

## YOUR TASK
1. Understand what the user wants
2. Determine if this is a SIMPLE or COMPLEX task
3. Identify which files need to be modified
4. Create a brief execution plan

## SIMPLE TASKS (route to Haiku):
- Single text/string changes
- Simple styling updates (colors, fonts, sizes)
- Adding simple content
- File exists and only needs small edits
- Confidence > 0.8

## COMPLEX TASKS (route to Sonnet):
- Multiple files need changes
- New feature implementation
- Architectural changes
- API integrations
- State management changes
- Uncertainty about approach

## MEMORY CONTEXT
{memoryContext}

## AVAILABLE FILES (already loaded)
{fileList}

## OUTPUT FORMAT
You MUST respond with ONLY a JSON object (no markdown, no explanation):
{
  "isComplex": false,
  "confidence": 0.9,
  "reasoning": "Simple text change in single file",
  "plan": {
    "summary": "Change title text in page.tsx",
    "steps": ["1. Find title in page.tsx", "2. Replace with new text"],
    "estimatedTools": 1
  },
  "filesToModify": ["src/app/page.tsx"]
}`;

const planningAgentNode = {
    "parameters": {
        "promptType": "define",
        "text": "={{ 'Analyze this request and create an execution plan:\\n\\nUSER REQUEST: ' + $json.message + '\\n\\nRespond with ONLY a JSON object.' }}",
        "options": {
            "systemMessage": "={{ '" + planningAgentSystemPrompt.replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'.replace('{memoryContext}', $json.memoryContext || 'No previous context').replace('{fileList}', Object.keys($json.fileContents || {}).join(', ') || 'No files loaded') }}",
            "maxIterations": 5,
            "returnIntermediateSteps": false
        }
    },
    "id": "planning-agent-node",
    "name": "Planning Agent",
    "type": "@n8n/n8n-nodes-langchain.agent",
    "typeVersion": 1.7,
    "position": [42920, 2128]
};

// =============================================
// 3. Add Parse Plan Node (extract JSON from Planning Agent)
// =============================================
const parsePlanNode = {
    "parameters": {
        "jsCode": `// Parse the planning agent's JSON response
const ctx = $('Fetch Memory').item.json;
const plannerOutput = $input.item.json?.output || '';

let plan = {
  isComplex: true,  // Default to complex if parsing fails
  confidence: 0.5,
  reasoning: 'Failed to parse plan',
  plan: { summary: 'Execute request', steps: [], estimatedTools: 5 },
  filesToModify: []
};

try {
  // Try to extract JSON from the output
  const jsonMatch = plannerOutput.match(/\\{[\\s\\S]*\\}/);
  if (jsonMatch) {
    plan = JSON.parse(jsonMatch[0]);
  }
} catch (e) {
  console.error('Failed to parse planning output:', e.message);
  console.log('Raw output:', plannerOutput.substring(0, 500));
}

// Insert thinking step for planning
const requestId = ctx.requestId || 'unknown';
const siteId = ctx.site?.id || 'unknown';

try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps',
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4',
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      request_id: requestId,
      site_id: siteId,
      step_number: 2,
      tool_name: 'plan',
      status: 'complete',
      message: plan.isComplex ? '🔬 Complex task - routing to advanced model' : '⚡ Simple task - using fast model',
      details: { plan: plan.plan, isComplex: plan.isComplex, confidence: plan.confidence }
    }),
    timeout: 5000
  });
} catch (e) {
  console.error('Failed to insert planning step:', e.message);
}

return [{
  json: {
    ...ctx,
    plan: plan,
    isComplex: plan.isComplex,
    executionPlan: plan.plan
  }
}];`
    },
    "id": "parse-plan-node",
    "name": "Parse Plan",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [43000, 2128]
};

// =============================================
// 4. Add Complexity Router (Switch Node)
// =============================================
const complexityRouterNode = {
    "parameters": {
        "rules": {
            "values": [
                {
                    "conditions": {
                        "options": {
                            "caseSensitive": true,
                            "leftValue": "",
                            "typeValidation": "strict"
                        },
                        "conditions": [
                            {
                                "leftValue": "={{ $json.isComplex }}",
                                "rightValue": false,
                                "operator": {
                                    "type": "boolean",
                                    "operation": "equals"
                                }
                            }
                        ],
                        "combinator": "and"
                    },
                    "renameOutput": true,
                    "outputKey": "Simple"
                },
                {
                    "conditions": {
                        "options": {
                            "caseSensitive": true,
                            "leftValue": "",
                            "typeValidation": "strict"
                        },
                        "conditions": [
                            {
                                "leftValue": "={{ $json.isComplex }}",
                                "rightValue": true,
                                "operator": {
                                    "type": "boolean",
                                    "operation": "equals"
                                }
                            }
                        ],
                        "combinator": "and"
                    },
                    "renameOutput": true,
                    "outputKey": "Complex"
                }
            ]
        },
        "options": {
            "fallbackOutput": "extra"
        }
    },
    "id": "complexity-router-node",
    "name": "Complexity Router",
    "type": "n8n-nodes-base.switch",
    "typeVersion": 3.2,
    "position": [43080, 2128]
};

// =============================================
// 5. Add Simple Executor Agent (Haiku)
// =============================================
const simpleExecutorSystemPrompt = `You are a fast execution agent for simple code changes.
You've been given a pre-analyzed plan. Execute it quickly.

## EXECUTION PLAN
{plan}

## FILES IN CONTEXT
{fileContents}

## RULES
1. Follow the plan exactly
2. Make minimal changes
3. Use str_replace_file for modifications
4. Use write_file only for new files`;

const simpleExecutorNode = {
    "parameters": {
        "promptType": "define",
        "text": "={{ $json.message }}",
        "options": {
            "systemMessage": "={{ '" + simpleExecutorSystemPrompt.replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'.replace('{plan}', JSON.stringify($json.executionPlan || {})).replace('{fileContents}', Object.keys($json.fileContents || {}).length > 0 ? Object.entries($json.fileContents).map(([path, content]) => '### ' + path + '\\n```\\n' + content.substring(0, 2000) + '\\n```').join('\\n\\n') : 'No files loaded') }}",
            "maxIterations": 5,
            "returnIntermediateSteps": true
        }
    },
    "id": "simple-executor-node",
    "name": "Simple Executor",
    "type": "@n8n/n8n-nodes-langchain.agent",
    "typeVersion": 1.7,
    "position": [43160, 2000]
};

// =============================================
// 6. Add Claude Haiku Model for Simple Executor
// =============================================
const claudeHaikuSimpleNode = {
    "parameters": {
        "model": {
            "__rl": true,
            "value": "claude-3-5-haiku-20241022",
            "mode": "list"
        },
        "options": {
            "maxTokensToSample": 4096,
            "temperature": 0.1
        }
    },
    "id": "haiku-model-simple",
    "name": "Claude Haiku Simple",
    "type": "@n8n/n8n-nodes-langchain.lmChatAnthropic",
    "typeVersion": 1.3,
    "position": [43048, 2192],
    "credentials": {
        "anthropicApi": {
            "id": "cR1eoa32avbXUEse",
            "name": "Anthropic account"
        }
    }
};

// =============================================
// 7. Duplicate tools for Simple Executor
// =============================================
const toolsForSimpleExecutor = [
    {
        "parameters": {
            "name": "list_files_simple",
            "description": "List files in a directory",
            "jsCode": workflow.nodes.find(n => n.name === 'list_files')?.parameters?.jsCode || ''
        },
        "id": "list-files-simple",
        "name": "list_files_simple",
        "type": "@n8n/n8n-nodes-langchain.toolCode",
        "typeVersion": 1,
        "position": [43048, 2352]
    },
    {
        "parameters": {
            "name": "read_file_simple",
            "description": "Read file contents",
            "jsCode": workflow.nodes.find(n => n.name === 'read_file')?.parameters?.jsCode || ''
        },
        "id": "read-file-simple",
        "name": "read_file_simple",
        "type": "@n8n/n8n-nodes-langchain.toolCode",
        "typeVersion": 1,
        "position": [43160, 2352]
    },
    {
        "parameters": {
            "name": "str_replace_file_simple",
            "description": "Search and replace text in a file",
            "jsCode": workflow.nodes.find(n => n.name === 'str_replace_file')?.parameters?.jsCode || ''
        },
        "id": "str-replace-simple",
        "name": "str_replace_file_simple",
        "type": "@n8n/n8n-nodes-langchain.toolCode",
        "typeVersion": 1,
        "position": [43272, 2352]
    },
    {
        "parameters": {
            "name": "write_file_simple",
            "description": "Create or overwrite a file",
            "jsCode": workflow.nodes.find(n => n.name === 'write_file')?.parameters?.jsCode || ''
        },
        "id": "write-file-simple",
        "name": "write_file_simple",
        "type": "@n8n/n8n-nodes-langchain.toolCode",
        "typeVersion": 1,
        "position": [43384, 2352]
    }
];

// =============================================
// 8. Add Merge Executor Results Node
// =============================================
const mergeExecutorResultsNode = {
    "parameters": {
        "mode": "combine",
        "mergeByPosition": "multiplex"
    },
    "id": "merge-executor-results",
    "name": "Merge Executor Results",
    "type": "n8n-nodes-base.merge",
    "typeVersion": 3,
    "position": [43280, 2128]
};

// =============================================
// Add all new nodes to workflow
// =============================================
workflow.nodes.push(
    claudeHaikuNode,
    planningAgentNode,
    parsePlanNode,
    complexityRouterNode,
    simpleExecutorNode,
    claudeHaikuSimpleNode,
    mergeExecutorResultsNode,
    ...toolsForSimpleExecutor
);

// =============================================
// 9. Rename existing AI Agent to Complex Executor
// =============================================
const aiAgentNode = workflow.nodes.find(n => n.name === 'AI Agent');
if (aiAgentNode) {
    aiAgentNode.name = 'Complex Executor';
    aiAgentNode.position = [43160, 2256];  // Move down for complex branch
}

// =============================================
// 10. Update connections
// =============================================
// Remove old connection: Fetch Memory -> AI Agent
delete workflow.connections['Fetch Memory'];

// Add new connections
workflow.connections['Fetch Memory'] = {
    "main": [[{ "node": "Planning Agent", "type": "main", "index": 0 }]]
};

workflow.connections['Planning Agent'] = {
    "main": [[{ "node": "Parse Plan", "type": "main", "index": 0 }]]
};

workflow.connections['Claude Haiku'] = {
    "ai_languageModel": [[{ "node": "Planning Agent", "type": "ai_languageModel", "index": 0 }]]
};

workflow.connections['Parse Plan'] = {
    "main": [[{ "node": "Complexity Router", "type": "main", "index": 0 }]]
};

// Complexity Router has two outputs: Simple (index 0), Complex (index 1)
workflow.connections['Complexity Router'] = {
    "main": [
        [{ "node": "Simple Executor", "type": "main", "index": 0 }],  // Simple tasks
        [{ "node": "Complex Executor", "type": "main", "index": 0 }]  // Complex tasks
    ]
};

workflow.connections['Simple Executor'] = {
    "main": [[{ "node": "Merge Executor Results", "type": "main", "index": 0 }]]
};

workflow.connections['Complex Executor'] = {
    "main": [[{ "node": "Merge Executor Results", "type": "main", "index": 1 }]]
};

workflow.connections['Merge Executor Results'] = {
    "main": [[{ "node": "Parse Results", "type": "main", "index": 0 }]]
};

// Connect Claude Haiku Simple to Simple Executor
workflow.connections['Claude Haiku Simple'] = {
    "ai_languageModel": [[{ "node": "Simple Executor", "type": "ai_languageModel", "index": 0 }]]
};

// Connect tools to Simple Executor
workflow.connections['list_files_simple'] = {
    "ai_tool": [[{ "node": "Simple Executor", "type": "ai_tool", "index": 0 }]]
};
workflow.connections['read_file_simple'] = {
    "ai_tool": [[{ "node": "Simple Executor", "type": "ai_tool", "index": 0 }]]
};
workflow.connections['str_replace_file_simple'] = {
    "ai_tool": [[{ "node": "Simple Executor", "type": "ai_tool", "index": 0 }]]
};
workflow.connections['write_file_simple'] = {
    "ai_tool": [[{ "node": "Simple Executor", "type": "ai_tool", "index": 0 }]]
};

// Update old tool connections to point to Complex Executor instead of AI Agent
const toolNames = ['list_files', 'read_file', 'write_file', 'str_replace_file', 'delete_file', 'search_files', 'add_dependency'];
for (const tool of toolNames) {
    if (workflow.connections[tool]) {
        workflow.connections[tool] = {
            "ai_tool": [[{ "node": "Complex Executor", "type": "ai_tool", "index": 0 }]]
        };
    }
}

// Update Claude connection for Complex Executor
workflow.connections['Claude'] = {
    "ai_languageModel": [[{ "node": "Complex Executor", "type": "ai_languageModel", "index": 0 }]]
};

// =============================================
// 11. Update Parse Results to handle both executors
// =============================================
const parseResultsNode = workflow.nodes.find(n => n.name === 'Parse Results');
if (parseResultsNode) {
    parseResultsNode.parameters.jsCode = `const ctx = $('Fetch Memory').item.json;

// Try to get output from either Simple or Complex Executor
let raw;
try {
  raw = $('Simple Executor')?.item?.json;
} catch (e) {}

if (!raw?.output) {
  try {
    raw = $('Complex Executor')?.item?.json;
  } catch (e) {}
}

if (!raw) {
  raw = $input.item.json;
}

const output = (raw?.output || '').replace(/\\*\\*/g, '');
const steps = raw?.intermediateSteps || [];

const filesModified = new Set();
const filesCreated = new Set();
const filesDeleted = new Set();
const toolCalls = [];

for (const step of steps) {
  if (step.action?.tool) toolCalls.push(step.action.tool);
  const obs = step.observation;
  let result = null;

  try {
    if (typeof obs === 'object' && obs !== null) {
       result = obs;
    } else if (typeof obs === 'string') {
       const jsonMatch = obs.match(/\\{.*\\}/s);
       if (jsonMatch) {
         result = JSON.parse(jsonMatch[0]);
       } else {
         result = JSON.parse(obs);
       }
    }
  } catch (e) {}

  if (result && result.success) {
    const file = result.file || result.to;
    if (file) {
      if (result.action === 'created') filesCreated.add(file);
      else if (result.action === 'updated' || result.action === 'replaced') filesModified.add(file);
    }
    if (result.deleted) filesDeleted.add(result.deleted);
  }
}

const warnings = [];
if (filesModified.size === 0 && filesCreated.size === 0 && filesDeleted.size === 0 && steps.length > 2) {
  warnings.push('No files were modified');
}

// Insert completion thinking step
const requestId = ctx.requestId || 'unknown';
const siteId = ctx.site?.id || 'unknown';

try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps',
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4',
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      request_id: requestId,
      site_id: siteId,
      step_number: 999999,
      tool_name: 'complete',
      status: 'complete',
      message: output || 'Request completed',
      details: { filesModified: [...filesModified], filesCreated: [...filesCreated], filesDeleted: [...filesDeleted], usedSimpleExecutor: ctx.isComplex === false }
    }),
    timeout: 5000
  });
} catch (e) {
  console.error('Failed to insert completion step:', e.message);
}

return [{
  json: {
    ...ctx,
    plan: { humanSummary: output, warnings },
    filesModified: [...filesModified],
    filesCreated: [...filesCreated],
    filesDeleted: [...filesDeleted],
    iterations: steps.length,
    toolsUsed: [...new Set(toolCalls)]
  }
}];`;
}

// Write the updated workflow
fs.writeFileSync('/Users/omarobeid/Desktop/aieditor/n8n/FIXED-AGENT-WORKFLOW-V15.json', JSON.stringify(workflow, null, 4));

console.log('✅ V15 workflow created with multi-agent architecture!');
console.log('New nodes added:');
console.log('  - Planning Agent (Claude Haiku)');
console.log('  - Claude Haiku model');
console.log('  - Parse Plan');
console.log('  - Complexity Router');
console.log('  - Simple Executor (Haiku)');
console.log('  - Claude Haiku Simple model');
console.log('  - Merge Executor Results');
console.log('  - 4 tools for Simple Executor');
console.log('Renamed: AI Agent -> Complex Executor');
