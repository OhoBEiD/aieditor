const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V19.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Creating robust input parsing that handles JSON encoding...\n');

// Fix write_file with robust parsing
const writeFileNode = workflow.nodes.find(n => n.name === 'write_file');
if (writeFileNode) {
  console.log('✅ Fixing write_file with robust parsing');

  writeFileNode.parameters.jsCode = `// Try multiple input paths
let rawInput = '';
try {
  rawInput = $input.item.json.query || $input.item.json || $input.first().json.query || $input.first().json || $json.query || $json || '';
} catch (e) {
  return 'Error: Could not access input. Debug: ' + e.message;
}

// Convert to string and handle JSON encoding
let input = '';
if (typeof rawInput === 'string') {
  input = rawInput;
} else if (typeof rawInput === 'object') {
  input = JSON.stringify(rawInput);
} else {
  input = String(rawInput);
}

// Try to parse if it's JSON-encoded
if (input.startsWith('"') && input.endsWith('"')) {
  try {
    input = JSON.parse(input);
  } catch (e) {}
}

input = input.trim();

// Debug: Log first 200 chars to see what we're getting
console.log('write_file input (first 200 chars):', input.substring(0, 200));
console.log('write_file input length:', input.length);
console.log('Looking for separator: |||');

// Find separator - try different variations
let idx = input.indexOf('|||');
if (idx === -1) {
  // Try URL-encoded version
  idx = input.indexOf('%7C%7C%7C');
  if (idx !== -1) {
    console.log('Found URL-encoded separator');
    input = decodeURIComponent(input);
    idx = input.indexOf('|||');
  }
}

if (idx === -1) {
  return 'Error: Invalid format. Use: filePath|||fileContent. Got input (first 100 chars): ' + input.substring(0, 100);
}

const filePath = input.substring(0, idx).trim();
const content = input.substring(idx + 3);

console.log('Parsed filePath:', filePath);
console.log('Parsed content length:', content.length);

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
}

// Fix str_replace_file similarly
const strReplaceNode = workflow.nodes.find(n => n.name === 'str_replace_file');
if (strReplaceNode) {
  console.log('✅ Fixing str_replace_file with robust parsing');

  strReplaceNode.parameters.jsCode = `let rawInput = '';
try {
  rawInput = $input.item.json.query || $input.item.json || $input.first().json.query || $input.first().json || $json.query || $json || '';
} catch (e) {
  return 'Error: Could not access input';
}

let input = '';
if (typeof rawInput === 'string') {
  input = rawInput;
} else if (typeof rawInput === 'object') {
  input = JSON.stringify(rawInput);
} else {
  input = String(rawInput);
}

// Try to parse if JSON-encoded
if (input.startsWith('"') && input.endsWith('"')) {
  try {
    input = JSON.parse(input);
  } catch (e) {}
}

input = input.trim();

console.log('str_replace input (first 200 chars):', input.substring(0, 200));

let firstSep = input.indexOf('|||');
if (firstSep === -1) {
  firstSep = input.indexOf('%7C%7C%7C');
  if (firstSep !== -1) {
    input = decodeURIComponent(input);
    firstSep = input.indexOf('|||');
  }
}

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
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V20.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ Created V20 with robust input parsing!');
console.log('📁 Saved to:', outputPath);
console.log('\n🔍 Improvements:');
console.log('  1. Handles JSON-encoded strings');
console.log('  2. Handles URL-encoded separators');
console.log('  3. Logs input for debugging');
console.log('  4. Shows first 100 chars on error');
console.log('\n💡 The logs will tell us exactly what format n8n is using!');
