const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V22.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Updating str_replace error messages to guide AI better...\n');

// Update str_replace_file with better error messaging
const strReplaceNode = workflow.nodes.find(n => n.name === 'str_replace_file');
if (strReplaceNode) {
  console.log('✅ Updating str_replace_file with better error handling');

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
     // Enhanced error message that tells AI to use read_file first
     if (body?.response?.error === 'Search text not found in file') {
       return 'Error: Search text not found in file. The text you searched for does not exist exactly as written. You MUST use read_file first to see the actual content, then use the EXACT text from the file (including all whitespace, newlines, and formatting) in your search parameter. Do not guess the file content.';
     }
     const debugInfo = { status: response.statusCode, sent: { siteId, filePath, searchLen: search?.length, replaceLen: replace?.length }, response: body };
     return 'Error: Orchestrator ' + response.statusCode + ' - ' + JSON.stringify(debugInfo);
  }

  return JSON.stringify({ success: true, file: filePath, action: 'replaced' });
} catch (e) {
  return 'Error: Exception - ' + e.message;
}`;
}

// Also update the system prompt for Complex Executor to emphasize read_file before str_replace
const complexExecutor = workflow.nodes.find(n => n.name === 'Complex Executor');
if (complexExecutor) {
  console.log('✅ Updating Complex Executor system prompt');

  const currentSystemMsg = complexExecutor.parameters.options.systemMessage;
  // Add a rule about read_file before str_replace
  const newSystemMsg = currentSystemMsg.replace(
    'R:1tool/turn|str_replace>write',
    'R:1tool/turn|str_replace>write|ALWAYS read_file before str_replace'
  );
  complexExecutor.parameters.options.systemMessage = newSystemMsg;
}

// Update Simple Executor too
const simpleExecutor = workflow.nodes.find(n => n.name === 'Simple Executor');
if (simpleExecutor) {
  console.log('✅ Updating Simple Executor system prompt');

  const currentSystemMsg = simpleExecutor.parameters.options.systemMessage;
  const newSystemMsg = currentSystemMsg.replace(
    'R:1tool/turn|str_replace>write',
    'R:1tool/turn|str_replace>write|ALWAYS read_file before str_replace'
  );
  simpleExecutor.parameters.options.systemMessage = newSystemMsg;
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V23.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ Created V23 with improved str_replace guidance!');
console.log('📁 Saved to:', outputPath);
console.log('\n🔍 Key changes:');
console.log('  1. str_replace now returns a clear error telling AI to use read_file first');
console.log('  2. System prompts updated to emphasize: ALWAYS read_file before str_replace');
console.log('  3. This will prevent the AI from guessing file content');
console.log('\n💡 The AI will now read the file to get exact content before replacing!');
