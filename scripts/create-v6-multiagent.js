const fs = require('fs');

// V6 Multi-Agent Workflow: Planner (Haiku) + Executor (Sonnet)
const workflow = {
    "name": "AI Editor - V6 Multi-Agent (Planner + Executor)",
    "nodes": [
        // === WEBHOOK ===
        {
            "parameters": {
                "httpMethod": "POST",
                "path": "agent/edit-ui",
                "responseMode": "responseNode",
                "options": { "allowedOrigins": "*" }
            },
            "id": "webhook-1",
            "name": "Webhook Edit UI",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [200, 500],
            "webhookId": "edit-ui"
        },

        // === VALIDATE INPUT ===
        {
            "parameters": {
                "jsCode": `const b=$input.first().json.body||$input.first().json;
const req=['siteId','conversationId','userId','message'];
const miss=req.filter(k=>!b[k]);
if(miss.length)throw new Error('Missing: '+miss.join(', '));
const rid='req_'+Date.now()+'_'+Math.random().toString(36).slice(2,11);
return[{json:{siteId:b.siteId,conversationId:b.conversationId,userId:b.userId,message:b.message,pageUrl:b.pageUrl||null,requestId:rid,image:b.image||null}}];`
            },
            "id": "validate-1",
            "name": "Validate Input",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [400, 500]
        },

        // === LOAD SITE ===
        {
            "parameters": {
                "url": "=https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/sites?site_key=eq.{{$json.siteId}}&select=*",
                "sendHeaders": true,
                "headerParameters": {
                    "parameters": [
                        { "name": "apikey", "value": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4" },
                        { "name": "Authorization", "value": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4" }
                    ]
                },
                "options": {}
            },
            "id": "loadsite-1",
            "name": "Load Site",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [600, 500]
        },

        // === BUILD CONTEXT ===
        {
            "parameters": {
                "jsCode": `const inp=$('Validate Input').item.json;
const siteArr=$input.first().json;
const site=Array.isArray(siteArr)?siteArr[0]:siteArr;
if(!site)throw new Error('Site not found');

const repoUrl=site.repo_url||'';
const match=repoUrl.match(/github\\.com\\/([^/]+)\\/([^/]+)/);
const owner=match?match[1]:'';
const repo=match?match[2].replace(/\\.git$/,''):'';

return [{json:{...inp,site:{id:site.id,name:site.name,repo_url:site.repo_url,default_branch:site.default_branch||'main',owner,repo},owner,repo,branch:site.default_branch||'main'}}];`
            },
            "id": "buildctx-1",
            "name": "Build Context",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [800, 500]
        },

        // === FLY START PREVIEW ===
        {
            "parameters": {
                "method": "POST",
                "url": "https://preview-orchestrator.fly.dev/preview/start",
                "sendHeaders": true,
                "headerParameters": { "parameters": [{ "name": "Content-Type", "value": "application/json" }] },
                "sendBody": true,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify({ siteId: $json.site.id, repoUrl: $json.site.repo_url, branch: $json.site.default_branch }) }}",
                "options": { "response": { "response": { "neverError": true } }, "timeout": 120000 }
            },
            "id": "flystart-1",
            "name": "Fly Start Preview",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [1000, 500]
        },

        // === MERGE FLY + GET FILE LIST ===
        {
            "parameters": {
                "jsCode": `const ctx = $('Build Context').item.json;
const flyResp = $input.first().json;

// Get file list from GitHub for planner
let fileList = [];
try {
  const owner = ctx.owner;
  const repo = ctx.repo;
  const branch = ctx.branch || 'main';
  
  // We'll use a simple list - planner will pick what it needs
  fileList = [
    'src/app/page.tsx',
    'src/app/layout.tsx', 
    'src/app/globals.css',
    'src/components/',
    'tailwind.config.js'
  ];
} catch (e) {}

return [{ json: { ...ctx, previewUrl: flyResp.previewUrl || '', fileList } }];`
            },
            "id": "mergefly-1",
            "name": "Merge Fly + File List",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1200, 500]
        },

        // === PLANNER AGENT (Claude Haiku - cheap/fast) ===
        {
            "parameters": {
                "promptType": "define",
                "text": "={{ $json.message }}",
                "options": {
                    "systemMessage": `You are a code change planner. Analyze the request and output a JSON plan.

REPO: {{ $json.owner }}/{{ $json.repo }}
COMMON FILES: {{ $json.fileList.join(', ') }}

Return ONLY valid JSON (no markdown, no explanation):
{
  "files_to_read": ["exact paths to read before making changes"],
  "files_to_modify": ["exact paths to create or update"],
  "summary": "one sentence description of changes"
}

RULES:
- For color/theme changes: read and modify globals.css
- For component changes: read the component first, then modify
- For new pages: files_to_modify should include the new path
- Keep file lists minimal - only what's needed`,
                    "maxIterations": 1
                }
            },
            "id": "planner-1",
            "name": "Planner Agent",
            "type": "@n8n/n8n-nodes-langchain.agent",
            "typeVersion": 1.7,
            "position": [1400, 500]
        },

        // === PLANNER MODEL (Claude Haiku - cheap!) ===
        {
            "parameters": {
                "model": {
                    "__rl": true,
                    "value": "claude-3-haiku-20240307",
                    "mode": "list",
                    "cachedResultName": "Claude 3 Haiku"
                },
                "options": {
                    "maxTokensToSample": 500
                }
            },
            "id": "haiku-1",
            "name": "Haiku (Planner)",
            "type": "@n8n/n8n-nodes-langchain.lmChatAnthropic",
            "typeVersion": 1.3,
            "position": [1300, 700],
            "credentials": {
                "anthropicApi": {
                    "id": "cR1eoa32avbXUEse",
                    "name": "Anthropic account"
                }
            }
        },

        // === PARSE PLAN ===
        {
            "parameters": {
                "jsCode": `const ctx = $('Merge Fly + File List').item.json;
const raw = $('Planner Agent').item.json;
let out = raw?.output || raw?.text || '';

// Parse the JSON plan
let plan = { files_to_read: [], files_to_modify: [], summary: '' };
try {
  // Extract JSON from response
  const jsonMatch = out.match(/\\{[\\s\\S]*\\}/);
  if (jsonMatch) {
    plan = JSON.parse(jsonMatch[0]);
  }
} catch (e) {
  // Fallback: guess based on message
  const msg = ctx.message.toLowerCase();
  if (msg.includes('color') || msg.includes('theme') || msg.includes('style')) {
    plan.files_to_read = ['src/app/globals.css'];
    plan.files_to_modify = ['src/app/globals.css'];
  } else {
    plan.files_to_read = ['src/app/page.tsx'];
    plan.files_to_modify = ['src/app/page.tsx'];
  }
  plan.summary = ctx.message;
}

return [{ json: { ...ctx, plan, filesToFetch: plan.files_to_read || [] } }];`
            },
            "id": "parseplan-1",
            "name": "Parse Plan",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1600, 500]
        },

        // === PREPARE FETCH ===
        {
            "parameters": {
                "jsCode": `const ctx = $input.first().json;
const files = ctx.filesToFetch || [];
if (files.length === 0) {
  return [{ json: { ...ctx, fileContents: {} } }];
}
return files.slice(0, 3).map((f, idx) => ({ json: { ...ctx, currentFetchPath: f, fetchIndex: idx } }));`
            },
            "id": "prepfetch-1",
            "name": "Prepare Fetch",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1800, 500]
        },

        // === FETCH FILES ===
        {
            "parameters": {
                "url": "=https://api.github.com/repos/{{ $json.owner }}/{{ $json.repo }}/contents/{{ $json.currentFetchPath }}?ref={{ $json.branch }}",
                "sendHeaders": true,
                "headerParameters": {
                    "parameters": [
                        { "name": "Authorization", "value": "Bearer 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" },
                        { "name": "Accept", "value": "application/vnd.github+json" }
                    ]
                },
                "options": { "response": { "response": { "neverError": true } } }
            },
            "id": "fetchfiles-1",
            "name": "Fetch Files",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [2000, 500]
        },

        // === MERGE FILES ===
        {
            "parameters": {
                "jsCode": `const prepareItems = $('Prepare Fetch').all();
const fetchItems = $input.all();
const originalCtx = $('Parse Plan').item.json;

const fileContents = {};
for (let i = 0; i < prepareItems.length; i++) {
  const path = prepareItems[i].json.currentFetchPath;
  const content = fetchItems[i]?.json?.content;
  if (path && content) {
    try {
      fileContents[path] = Buffer.from(content, 'base64').toString('utf8');
    } catch (e) {}
  }
}

return [{ json: { ...originalCtx, fileContents } }];`
            },
            "id": "mergefiles-1",
            "name": "Merge Files",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [2200, 500]
        },

        // === EXECUTOR AGENT (Claude Sonnet - capable) ===
        {
            "parameters": {
                "promptType": "define",
                "text": "={{ $json.plan.summary || $json.message }}",
                "options": {
                    "systemMessage": `Execute this plan. Use create_file for each change.

PLAN: {{ $json.plan.summary }}
FILES TO MODIFY: {{ ($json.plan.files_to_modify || []).join(', ') }}

CURRENT FILE CONTENTS:
{{ Object.entries($json.fileContents || {}).map(([p,c]) => '=== ' + p + ' ===\\n' + c).join('\\n\\n') }}

RULES:
1. Call create_file for EACH file in files_to_modify
2. Include COMPLETE file content (not just changes)
3. Use 'use client' for React components with hooks
4. Be efficient - aim for 1-2 tool calls max`,
                    "maxIterations": 3,
                    "returnIntermediateSteps": true
                }
            },
            "id": "executor-1",
            "name": "Executor Agent",
            "type": "@n8n/n8n-nodes-langchain.agent",
            "typeVersion": 1.7,
            "position": [2400, 500]
        },

        // === EXECUTOR MODEL (Claude Sonnet - capable) ===
        {
            "parameters": {
                "model": {
                    "__rl": true,
                    "value": "claude-sonnet-4-5-20250929",
                    "mode": "list",
                    "cachedResultName": "Claude Sonnet 4.5"
                },
                "options": {
                    "maxTokensToSample": 8000
                }
            },
            "id": "sonnet-1",
            "name": "Sonnet (Executor)",
            "type": "@n8n/n8n-nodes-langchain.lmChatAnthropic",
            "typeVersion": 1.3,
            "position": [2300, 700],
            "credentials": {
                "anthropicApi": {
                    "id": "cR1eoa32avbXUEse",
                    "name": "Anthropic account"
                }
            }
        },

        // === CREATE FILE TOOL ===
        {
            "parameters": {
                "name": "create_file",
                "description": "Create/update file. JSON: {filePath, content}",
                "jsCode": `let input;
try { input = typeof query === 'string' ? JSON.parse(query) : query; } 
catch (e) { return '{"error":"Invalid JSON"}'; }

const { filePath, content } = input;
if (!filePath || !content) return '{"error":"filePath and content required"}';

let ctx = {};
try { ctx = $('Merge Files')?.item?.json || {}; } catch (e) {}

const siteId = ctx.siteId || ctx.site?.id;
const owner = ctx.owner || ctx.site?.owner;
const repo = ctx.repo || ctx.site?.repo;
const branch = ctx.branch || 'main';

if (!owner || !repo) return '{"error":"no repo"}';

try {
  // Direct write for HMR
  if (siteId) {
    try {
      await this.helpers.httpRequest({
        method: 'POST',
        url: 'https://preview-orchestrator.fly.dev/preview/write',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, filePath, content }),
        timeout: 5000
      });
    } catch (e) {}
  }

  // GitHub commit
  let sha = null;
  try {
    const existing = await this.helpers.httpRequest({
      method: 'GET',
      url: \`https://api.github.com/repos/\${owner}/\${repo}/contents/\${filePath}?ref=\${branch}\`,
      headers: { 'Authorization': 'Bearer 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', 'Accept': 'application/vnd.github+json' }
    });
    sha = existing.sha;
  } catch (e) {}

  const body = { message: (sha ? 'Update ' : 'Create ') + filePath, content: Buffer.from(content).toString('base64'), branch };
  if (sha) body.sha = sha;

  await this.helpers.httpRequest({
    method: 'PUT',
    url: \`https://api.github.com/repos/\${owner}/\${repo}/contents/\${filePath}\`,
    headers: { 'Authorization': 'Bearer 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', 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  return \`{"ok":true,"file":"\${filePath}"}\`;
} catch (e) {
  return \`{"error":"\${e.message}"}\`;
}`
            },
            "id": "createfile-1",
            "name": "Create File",
            "type": "@n8n/n8n-nodes-langchain.toolCode",
            "typeVersion": 1,
            "position": [2500, 700]
        },

        // === PARSE RESULTS ===
        {
            "parameters": {
                "jsCode": `const ctx = $('Merge Files').item.json;
const raw = $('Executor Agent').item.json;
let out = raw?.output || raw?.text || '';

const filesCreated = [];
const steps = raw?.intermediateSteps || [];

for (const step of steps) {
  const action = step?.action;
  const obs = step?.observation || '';
  if (action?.tool === 'create_file') {
    try {
      const o = typeof obs === 'string' ? JSON.parse(obs) : obs;
      if (o.ok && o.file) filesCreated.push(o.file);
    } catch (e) {
      try {
        const inp = typeof action.toolInput === 'string' ? JSON.parse(action.toolInput) : action.toolInput;
        if (inp.filePath) filesCreated.push(inp.filePath);
      } catch (e2) {}
    }
  }
}

const result = {
  humanSummary: ctx.plan?.summary || out || (filesCreated.length ? 'Updated: ' + filesCreated.join(', ') : 'Processed'),
  filesCreated,
  iterations: steps.length
};

return [{ json: { ...ctx, result, filesCreated } }];`
            },
            "id": "parseresults-1",
            "name": "Parse Results",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [2600, 500]
        },

        // === GIT PULL ===
        {
            "parameters": {
                "method": "POST",
                "url": "https://preview-orchestrator.fly.dev/preview/pull",
                "sendHeaders": true,
                "headerParameters": { "parameters": [{ "name": "Content-Type", "value": "application/json" }] },
                "sendBody": true,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify({ siteId: $json.site.id }) }}",
                "options": { "response": { "response": { "neverError": true } }, "timeout": 60000 }
            },
            "id": "gitpull-1",
            "name": "Git Pull",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [2800, 500]
        },

        // === MERGE FINAL ===
        {
            "parameters": {
                "jsCode": `const ctx = $('Parse Results').item.json;
return [{ json: { ...ctx, pullOk: true } }];`
            },
            "id": "mergefinal-1",
            "name": "Merge Final",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [3000, 500]
        },

        // === SAVE REQUEST ===
        {
            "parameters": {
                "method": "POST",
                "url": "=https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/code_versions",
                "sendHeaders": true,
                "headerParameters": {
                    "parameters": [
                        { "name": "apikey", "value": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4" },
                        { "name": "Authorization", "value": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4" },
                        { "name": "Content-Type", "value": "application/json" },
                        { "name": "Prefer", "value": "return=representation" }
                    ]
                },
                "sendBody": true,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify({ site_id: $json.site.id, request_id: $json.requestId, instruction: $json.message, plan_json: $json.plan, diff: '', status: 'preview_ready', preview_url: $json.previewUrl || '' }) }}",
                "options": { "response": { "response": { "neverError": true } } }
            },
            "id": "savereq-1",
            "name": "Save Request",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2,
            "position": [3200, 500]
        },

        // === RESPONSE ===
        {
            "parameters": {
                "respondWith": "json",
                "responseBody": "={{ JSON.stringify({ requestId: $('Merge Final').item.json.requestId, status: 'preview_ready', summary: $('Merge Final').item.json.result?.humanSummary || '', previewUrl: $('Merge Final').item.json.previewUrl || '', filesChanged: $('Merge Final').item.json.filesCreated || [], iterations: $('Merge Final').item.json.result?.iterations || 0, plan: $('Merge Final').item.json.plan || {} }) }}",
                "options": {}
            },
            "id": "response-1",
            "name": "Response",
            "type": "n8n-nodes-base.respondToWebhook",
            "typeVersion": 1.1,
            "position": [3400, 500]
        }
    ],
    "connections": {
        "Webhook Edit UI": { "main": [[{ "node": "Validate Input", "type": "main", "index": 0 }]] },
        "Validate Input": { "main": [[{ "node": "Load Site", "type": "main", "index": 0 }]] },
        "Load Site": { "main": [[{ "node": "Build Context", "type": "main", "index": 0 }]] },
        "Build Context": { "main": [[{ "node": "Fly Start Preview", "type": "main", "index": 0 }]] },
        "Fly Start Preview": { "main": [[{ "node": "Merge Fly + File List", "type": "main", "index": 0 }]] },
        "Merge Fly + File List": { "main": [[{ "node": "Planner Agent", "type": "main", "index": 0 }]] },
        "Haiku (Planner)": { "ai_languageModel": [[{ "node": "Planner Agent", "type": "ai_languageModel", "index": 0 }]] },
        "Planner Agent": { "main": [[{ "node": "Parse Plan", "type": "main", "index": 0 }]] },
        "Parse Plan": { "main": [[{ "node": "Prepare Fetch", "type": "main", "index": 0 }]] },
        "Prepare Fetch": { "main": [[{ "node": "Fetch Files", "type": "main", "index": 0 }]] },
        "Fetch Files": { "main": [[{ "node": "Merge Files", "type": "main", "index": 0 }]] },
        "Merge Files": { "main": [[{ "node": "Executor Agent", "type": "main", "index": 0 }]] },
        "Sonnet (Executor)": { "ai_languageModel": [[{ "node": "Executor Agent", "type": "ai_languageModel", "index": 0 }]] },
        "Create File": { "ai_tool": [[{ "node": "Executor Agent", "type": "ai_tool", "index": 0 }]] },
        "Executor Agent": { "main": [[{ "node": "Parse Results", "type": "main", "index": 0 }]] },
        "Parse Results": { "main": [[{ "node": "Git Pull", "type": "main", "index": 0 }]] },
        "Git Pull": { "main": [[{ "node": "Merge Final", "type": "main", "index": 0 }]] },
        "Merge Final": { "main": [[{ "node": "Save Request", "type": "main", "index": 0 }]] },
        "Save Request": { "main": [[{ "node": "Response", "type": "main", "index": 0 }]] }
    },
    "pinData": {},
    "meta": {
        "templateCredsSetupCompleted": true,
        "instanceId": "8278f0fbb558df00ecd79690c89f9c1e0fbf89bbd188221ebac4a3ae271261b8"
    }
};

fs.writeFileSync('n8n/AI-EDITOR-V6-MULTI-AGENT.json', JSON.stringify(workflow, null, 2));
console.log('Created AI-EDITOR-V6-MULTI-AGENT.json');
console.log('');
console.log('MULTI-AGENT ARCHITECTURE:');
console.log('1. Planner Agent (Claude Haiku) - ~2k tokens, analyzes request');
console.log('2. Executor Agent (Claude Sonnet) - ~6k tokens, makes changes');
console.log('');
console.log('EXPECTED TOKEN USAGE:');
console.log('- Planner: ~2,000 tokens (1 call)');
console.log('- Executor: ~6,000 tokens × 1-3 calls = ~12,000 max');
console.log('- TOTAL: ~14,000 tokens per request');
console.log('');
console.log('COST COMPARISON:');
console.log('- Haiku: $0.25/$1.25 per million (12x cheaper!)');
console.log('- Old workflow: ~$0.50/request');
console.log('- New multi-agent: ~$0.05/request');
