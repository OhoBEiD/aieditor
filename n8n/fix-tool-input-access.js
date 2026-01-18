const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V18.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Fixing tool input access to check multiple possible paths...\n');

// Tools that need fixing
const toolsToFix = [
  'write_file',
  'str_replace_file',
  'delete_file',
  'read_file',
  'search_files',
  'create_component',
  'fetch_stock_image'
];

for (const toolName of toolsToFix) {
  const tool = workflow.nodes.find(n => n.name === toolName);
  if (!tool) {
    console.log(`❌ Tool not found: ${toolName}`);
    continue;
  }

  const originalCode = tool.parameters.jsCode;

  // Replace the input access to check multiple possible locations
  // The issue is that we don't know the exact path where n8n passes the tool input
  // So we'll check: $input.item.json.query, $input.item.json, $input.first().json.query, $json.query

  let newCode;

  if (toolName === 'write_file') {
    newCode = `// Try multiple input paths to find where n8n passes the tool input
let rawInput = '';
try {
  rawInput = $input.item.json.query || $input.item.json || $input.first().json.query || $input.first().json || $json.query || $json || '';
} catch (e) {
  return 'Error: Could not access input. Debug: ' + e.message;
}

const input = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

// Debug logging
if (!input) {
  return 'Error: Empty input. Tried: $input.item.json.query, $input.item.json, $input.first().json.query, $json.query';
}

const idx = input.indexOf('|||');
if (idx === -1) return 'Error: Invalid format. Use: filePath|||fileContent. Got input length: ' + input.length;

const filePath = input.substring(0, idx).trim();
const content = input.substring(idx + 3);
if (!filePath) return 'Error: File path required';

const ctx = $('Merge Files')?.item?.json || {};
const siteId = ctx.site?.id;
const githubToken = ctx.githubToken;
const requestId = ctx.requestId || 'req';
const siteUuid = ctx.site?.uuid || siteId;

if (!siteId) return 'Error: No site context';

// Emit progress start
try { await this.helpers.httpRequest({ method: 'POST', url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps', headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ request_id: requestId, site_id: siteUuid, step_number: Date.now() % 100000, tool_name: 'write_file', status: 'running', message: 'Writing ' + filePath.split('/').pop(), details: { path: filePath, lines: content.split('\\n').length } }), timeout: 3000 }); } catch(e) {}

try {
  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://preview-orchestrator.fly.dev/preview/write',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, filePath, content, githubToken }),
    timeout: 30000,
    json: true,
    ignoreHttpStatusErrors: true,
    returnFullResponse: true
  });

  const body = response.body;
  if (response.statusCode >= 400 || (body && !body.success && !body.ok)) {
     const debugInfo = { status: response.statusCode, sent: { siteId, filePath, contentLen: content?.length }, response: body };
     return 'Error: Orchestrator ' + response.statusCode + ' - ' + JSON.stringify(debugInfo);
  }

  return JSON.stringify({ success: true, file: filePath, action: 'created' });
} catch (e) {
  return 'Error: Exception - ' + e.message;
}`;
  } else if (toolName === 'str_replace_file') {
    newCode = `let rawInput = '';
try {
  rawInput = $input.item.json.query || $input.item.json || $input.first().json.query || $input.first().json || $json.query || $json || '';
} catch (e) {
  return 'Error: Could not access input';
}

const input = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

if (!input) return 'Error: Empty input';

const firstSep = input.indexOf('|||');
if (firstSep === -1) return 'Error: Invalid format. Use: filePath|||searchText|||replaceText';
const secondSep = input.indexOf('|||', firstSep + 3);
if (secondSep === -1) return 'Error: Invalid format. Use: filePath|||searchText|||replaceText';

const filePath = input.substring(0, firstSep).trim();
const search = input.substring(firstSep + 3, secondSep);
const replace = input.substring(secondSep + 3);

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
  } else if (toolName === 'create_component') {
    newCode = originalCode.replace(
      'const rawInput = $input.item.json.query || \'\';',
      `let rawInput = '';
try {
  rawInput = $input.item.json.query || $input.item.json || $input.first().json.query || $input.first().json || $json.query || $json || '';
} catch (e) {
  return 'Error: Could not access input';
}`
    );
  } else if (toolName === 'fetch_stock_image') {
    newCode = originalCode.replace(
      'const rawInput = $input.item.json.query || \'\';',
      `let rawInput = '';
try {
  rawInput = $input.item.json.query || $input.item.json || $input.first().json.query || $input.first().json || $json.query || $json || '';
} catch (e) {
  return 'Error: Could not access input';
}`
    );
  } else {
    // For read_file, delete_file, search_files
    newCode = originalCode.replace(
      'const rawInput = $input.item.json.query || \'\';',
      `let rawInput = '';
try {
  rawInput = $input.item.json.query || $input.item.json || $input.first().json.query || $input.first().json || $json.query || $json || '';
} catch (e) {
  return 'Error: Could not access input';
}`
    );
  }

  tool.parameters.jsCode = newCode;
  console.log(`✅ Fixed ${toolName}`);
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V19.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ All tools updated to try multiple input paths!');
console.log('📁 Saved to:', outputPath);
console.log('\n🔍 Tools now check these paths in order:');
console.log('  1. $input.item.json.query');
console.log('  2. $input.item.json');
console.log('  3. $input.first().json.query');
console.log('  4. $input.first().json');
console.log('  5. $json.query');
console.log('  6. $json');
console.log('\n💡 This will help us see where n8n actually passes the tool input!');
