const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V21.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Fixing str_replace to handle escaped newlines...\n');

// Fix str_replace_file to unescape \n
const strReplaceNode = workflow.nodes.find(n => n.name === 'str_replace_file');
if (strReplaceNode) {
  console.log('✅ Fixing str_replace_file to handle \\n escaping');

  strReplaceNode.parameters.jsCode = `const rawInput = $fromAI('query');
const input = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

const firstSep = input.indexOf('|||');
if (firstSep === -1) return 'Error: Invalid format. Use: filePath|||searchText|||replaceText';
const secondSep = input.indexOf('|||', firstSep + 3);
if (secondSep === -1) return 'Error: Invalid format. Use: filePath|||searchText|||replaceText';

const filePath = input.substring(0, firstSep).trim();
let search = input.substring(firstSep + 3, secondSep);
let replace = input.substring(secondSep + 3);

// CRITICAL FIX: Convert escaped newlines to actual newlines
// AI agents often send \\n as literal text, but we need real newlines for matching
search = search.replace(/\\\\n/g, '\\n').replace(/\\\\t/g, '\\t');
replace = replace.replace(/\\\\n/g, '\\n').replace(/\\\\t/g, '\\t');

if (!filePath || !search) return 'Error: File path and search text required';

const ctx = $('Merge Files')?.item?.json || {};
const siteId = ctx.site?.id;
const githubToken = ctx.githubToken;
const requestId = ctx.requestId || 'req';
const siteUuid = ctx.site?.uuid || siteId;

if (!siteId) return 'Error: No site context';

// Emit progress
try { await this.helpers.httpRequest({ method: 'POST', url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps', headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ request_id: requestId, site_id: siteUuid, step_number: Date.now() % 100000, tool_name: 'str_replace', status: 'running', message: 'Editing ' + filePath.split('/').pop(), details: { path: filePath, searchLen: search.length, replaceLen: replace.length } }), timeout: 3000 }); } catch(e) {}

try {
  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://preview-orchestrator.fly.dev/preview/replace',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, filePath, search, replace, githubToken }),
    timeout: 30000,
    json: true,
    ignoreHttpStatusErrors: true,
    returnFullResponse: true
  });

  const body = response.body;
  if (response.statusCode >= 400 || (body && !body.success && !body.ok)) {
     const debugInfo = { status: response.statusCode, sent: { siteId, filePath, searchLen: search?.length, replaceLen: replace?.length }, response: body };
     return 'Error: Orchestrator ' + response.statusCode + ' - ' + JSON.stringify(debugInfo);
  }

  return JSON.stringify({ success: true, file: filePath, action: 'replaced' });
} catch (e) {
  return 'Error: Exception - ' + e.message;
}`;
}

// Fix create_component to be more flexible with input format
const createComponentNode = workflow.nodes.find(n => n.name === 'create_component');
if (createComponentNode) {
  console.log('✅ Fixing create_component to handle various input formats');

  createComponentNode.parameters.jsCode = `const rawInput = $fromAI('query');
let input = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

// Handle different input formats
let componentName = '';
let description = '';

const idx = input.indexOf('|||');
if (idx !== -1) {
  // Format: componentName|||description
  componentName = input.substring(0, idx).trim();
  description = input.substring(idx + 3).trim();
} else {
  // Try to parse as JSON object
  try {
    const parsed = JSON.parse(input);
    componentName = parsed.componentName || parsed.name || parsed.component || '';
    description = parsed.description || parsed.desc || '';
  } catch (e) {
    // Fallback: treat entire input as component name, generate generic description
    componentName = input;
    description = 'A ' + input + ' component';
  }
}

if (!componentName) return 'Error: Component name required';

const ctx = $('Merge Files')?.item?.json || {};
const requestId = ctx.requestId || 'req';
const siteId = ctx.site?.id;
const siteUuid = ctx.site?.uuid || siteId;

// Emit progress
try { await this.helpers.httpRequest({ method: 'POST', url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps', headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ request_id: requestId, site_id: siteUuid, step_number: Date.now() % 100000, tool_name: 'create_component', status: 'running', message: 'Creating ' + componentName, details: { name: componentName, desc: description.substring(0, 50) } }), timeout: 3000 }); } catch(e) {}

try {
  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://preview-orchestrator.fly.dev/generate/component',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ componentName, description }),
    timeout: 60000,
    json: true,
    ignoreHttpStatusErrors: true,
    returnFullResponse: true
  });

  const body = response.body;
  if (response.statusCode >= 400 || !body?.code) {
     return 'Error: Component generation failed - ' + JSON.stringify(body);
  }

  return body.code;
} catch (e) {
  return 'Error: Exception - ' + e.message;
}`;
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V22.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ Created V22 with newline handling!');
console.log('📁 Saved to:', outputPath);
console.log('\n🔍 Key changes:');
console.log('  1. str_replace: Converts \\\\n to actual newlines before sending to orchestrator');
console.log('  2. str_replace: Converts \\\\t to actual tabs');
console.log('  3. create_component: Accepts multiple input formats (|||, JSON, or plain text)');
console.log('\n💡 This should fix the "Search text not found" errors!');
