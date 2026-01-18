const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V20.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Fixing tools to use $fromAI(query) correctly (without type parameter)...\n');

// Fix write_file
const writeFileNode = workflow.nodes.find(n => n.name === 'write_file');
if (writeFileNode) {
  console.log('✅ Fixing write_file');

  writeFileNode.parameters.jsCode = `// Use $fromAI() WITHOUT the type parameter (third arg causes readonly errors)
const rawInput = $fromAI('query');
const input = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

const idx = input.indexOf('|||');
if (idx === -1) return 'Error: Invalid format. Use: filePath|||fileContent';

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
}

// Fix str_replace_file
const strReplaceNode = workflow.nodes.find(n => n.name === 'str_replace_file');
if (strReplaceNode) {
  console.log('✅ Fixing str_replace_file');

  strReplaceNode.parameters.jsCode = `const rawInput = $fromAI('query');
const input = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

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
}

// Fix delete_file
const deleteFileNode = workflow.nodes.find(n => n.name === 'delete_file');
if (deleteFileNode) {
  console.log('✅ Fixing delete_file');

  deleteFileNode.parameters.jsCode = `const rawInput = $fromAI('query');
const filePath = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

if (!filePath) return 'Error: File path required';

const ctx = $('Merge Files')?.item?.json || {};
const siteId = ctx.site?.id;
const githubToken = ctx.githubToken;
const requestId = ctx.requestId || 'req';
const siteUuid = ctx.site?.uuid || siteId;

if (!siteId) return 'Error: No site context';

// Emit progress
try { await this.helpers.httpRequest({ method: 'POST', url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps', headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ request_id: requestId, site_id: siteUuid, step_number: Date.now() % 100000, tool_name: 'delete_file', status: 'running', message: 'Deleting ' + filePath.split('/').pop(), details: { path: filePath } }), timeout: 3000 }); } catch(e) {}

try {
  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://preview-orchestrator.fly.dev/preview/delete',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, filePath, githubToken }),
    timeout: 30000,
    json: true,
    ignoreHttpStatusErrors: true,
    returnFullResponse: true
  });

  const body = response.body;
  if (response.statusCode >= 400 || (body && !body.success && !body.ok)) {
     return 'Error: Orchestrator ' + response.statusCode + ' - ' + JSON.stringify(body);
  }

  return JSON.stringify({ success: true, file: filePath, action: 'deleted' });
} catch (e) {
  return 'Error: Exception - ' + e.message;
}`;
}

// Fix read_file
const readFileNode = workflow.nodes.find(n => n.name === 'read_file');
if (readFileNode) {
  console.log('✅ Fixing read_file');

  readFileNode.parameters.jsCode = `const rawInput = $fromAI('query');
const filePath = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

if (!filePath) return 'Error: File path required';

const ctx = $('Merge Files')?.item?.json || {};
const siteId = ctx.site?.id;
const githubToken = ctx.githubToken;
const requestId = ctx.requestId || 'req';
const siteUuid = ctx.site?.uuid || siteId;

if (!siteId) return 'Error: No site context';

// Emit progress
try { await this.helpers.httpRequest({ method: 'POST', url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps', headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ request_id: requestId, site_id: siteUuid, step_number: Date.now() % 100000, tool_name: 'read_file', status: 'running', message: 'Reading ' + filePath.split('/').pop(), details: { path: filePath } }), timeout: 3000 }); } catch(e) {}

try {
  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://preview-orchestrator.fly.dev/preview/read',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, filePath, githubToken }),
    timeout: 30000,
    json: true,
    ignoreHttpStatusErrors: true,
    returnFullResponse: true
  });

  const body = response.body;
  if (response.statusCode >= 400 || (body && !body.success && !body.ok)) {
     return 'Error: Orchestrator ' + response.statusCode + ' - ' + JSON.stringify(body);
  }

  return body.content || 'Error: No content returned';
} catch (e) {
  return 'Error: Exception - ' + e.message;
}`;
}

// Fix search_files
const searchFilesNode = workflow.nodes.find(n => n.name === 'search_files');
if (searchFilesNode) {
  console.log('✅ Fixing search_files');

  searchFilesNode.parameters.jsCode = `const rawInput = $fromAI('query');
const searchQuery = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

if (!searchQuery) return 'Error: Search query required';

const ctx = $('Merge Files')?.item?.json || {};
const siteId = ctx.site?.id;
const githubToken = ctx.githubToken;
const requestId = ctx.requestId || 'req';
const siteUuid = ctx.site?.uuid || siteId;

if (!siteId) return 'Error: No site context';

// Emit progress
try { await this.helpers.httpRequest({ method: 'POST', url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps', headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ request_id: requestId, site_id: siteUuid, step_number: Date.now() % 100000, tool_name: 'search_files', status: 'running', message: 'Searching for: ' + searchQuery.substring(0, 30), details: { query: searchQuery } }), timeout: 3000 }); } catch(e) {}

try {
  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://preview-orchestrator.fly.dev/preview/search',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, query: searchQuery, githubToken }),
    timeout: 30000,
    json: true,
    ignoreHttpStatusErrors: true,
    returnFullResponse: true
  });

  const body = response.body;
  if (response.statusCode >= 400 || (body && !body.success && !body.ok)) {
     return 'Error: Orchestrator ' + response.statusCode + ' - ' + JSON.stringify(body);
  }

  return JSON.stringify(body.results || []);
} catch (e) {
  return 'Error: Exception - ' + e.message;
}`;
}

// Fix create_component
const createComponentNode = workflow.nodes.find(n => n.name === 'create_component');
if (createComponentNode) {
  console.log('✅ Fixing create_component');

  createComponentNode.parameters.jsCode = `const rawInput = $fromAI('query');
const input = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

const idx = input.indexOf('|||');
if (idx === -1) return 'Error: Invalid format. Use: componentName|||description';

const componentName = input.substring(0, idx).trim();
const description = input.substring(idx + 3).trim();

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

// Fix fetch_stock_image
const fetchStockImageNode = workflow.nodes.find(n => n.name === 'fetch_stock_image');
if (fetchStockImageNode) {
  console.log('✅ Fixing fetch_stock_image');

  fetchStockImageNode.parameters.jsCode = `const rawInput = $fromAI('query');
const query = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

if (!query) return 'Error: Image search query required';

const ctx = $('Merge Files')?.item?.json || {};
const requestId = ctx.requestId || 'req';
const siteId = ctx.site?.id;
const siteUuid = ctx.site?.uuid || siteId;

// Emit progress
try { await this.helpers.httpRequest({ method: 'POST', url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps', headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ request_id: requestId, site_id: siteUuid, step_number: Date.now() % 100000, tool_name: 'fetch_stock_image', status: 'running', message: 'Searching images: ' + query.substring(0, 30), details: { query } }), timeout: 3000 }); } catch(e) {}

try {
  const response = await this.helpers.httpRequest({
    method: 'GET',
    url: 'https://api.unsplash.com/search/photos?query=' + encodeURIComponent(query) + '&per_page=1&client_id=Sd5CivC-M2lboxuKdquTlsNgqovO80X2R2yqEwmBEe0',
    timeout: 15000,
    json: true,
    ignoreHttpStatusErrors: true,
    returnFullResponse: true
  });

  const body = response.body;
  if (response.statusCode >= 400 || !body?.results?.[0]) {
     return 'Error: No images found for query: ' + query;
  }

  const photo = body.results[0];
  return JSON.stringify({
    url: photo.urls.regular,
    alt: photo.alt_description || query,
    photographer: photo.user.name,
    photographerUrl: photo.user.links.html
  });
} catch (e) {
  return 'Error: Exception - ' + e.message;
}`;
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V21.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ Created V21 with correct $fromAI() usage!');
console.log('📁 Saved to:', outputPath);
console.log('\n🔍 Key changes:');
console.log('  • Using $fromAI(\'query\') WITHOUT type parameter');
console.log('  • Removed all fallback path logic from V19/V20');
console.log('  • Removed encoding detection (not needed)');
console.log('  • Simple, clean input access pattern');
console.log('\n💡 This should now correctly receive tool input from the AI agent!');
