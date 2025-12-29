// Updated str_replace_file tool - WITH THINKING STEP REPORTING
// This replaces your existing str_replace_file tool in the V12 Delimiter workflow

// Configuration
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Get raw input - format: filePath|||search|||replace
const rawInput = $fromAI('query', 'filePath|||search|||replace', 'string') || '';
const parts = rawInput.split('|||');

if (parts.length < 3) return 'Error: Use format filePath|||searchText|||replaceText';

const filePath = parts[0].trim().replace(/^\\/+/, '');
const search = parts[1];
const replace = parts.slice(2).join('|||'); // In case replace has |||

if (!filePath) return 'Error: filePath required';
if (!search) return 'Error: searchText required';

const ctx = $('Merge Files')?.item?.json || {};
const { owner, repo, branch } = ctx;
const siteId = ctx.site?.id;
const requestId = ctx.requestId;
const conversationId = ctx.conversationId;

if (!siteId) return 'Error: No site context';
if (!owner) return 'Error: No repository context';

// Helper function to write thinking step
async function writeThinkingStep(stepData) {
  try {
    await this.helpers.httpRequest({
      method: 'POST',
      url: `${SUPABASE_URL}/rest/v1/thinking_steps`,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        request_id: requestId,
        conversation_id: conversationId,
        site_id: siteId,
        ...stepData
      }),
      timeout: 3000
    });
  } catch (e) {
    console.error('Failed to write thinking step:', e.message);
  }
}

try {
  // STEP 1: Report that we're starting
  await writeThinkingStep.call(this, {
    step_number: Date.now(),
    tool_name: 'str_replace_file',
    status: 'running',
    message: `Reading ${filePath}...`,
    details: { filePath, action: 'read' }
  });

  // STEP 2: Read file content
  let content;
  try {
    const workspaceResponse = await this.helpers.httpRequest({
      method: 'POST',
      url: 'https://preview-orchestrator.fly.dev/preview/read',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, filePath }),
      timeout: 10000
    });
    content = workspaceResponse.content;
  } catch {
    // File not in workspace yet, get from GitHub
    const response = await this.helpers.httpRequest({
      method: 'GET',
      url: `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`,
      headers: {
        'Authorization': 'Bearer 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',
        'Accept': 'application/vnd.github+json'
      },
      timeout: 15000
    });
    content = Buffer.from(response.content, 'base64').toString('utf8');
  }

  // STEP 3: Report searching
  await writeThinkingStep.call(this, {
    step_number: Date.now(),
    tool_name: 'str_replace_file',
    status: 'running',
    message: `Modifying ${filePath}...`,
    details: { filePath, action: 'replace', searchLength: search.length }
  });

  // Check if search exists
  if (!content.includes(search)) {
    const lines = content.split('\\n');
    let hint = '';
    const searchLower = search.toLowerCase().substring(0, 20);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(searchLower)) {
        hint = ` Similar at line ${i+1}: "${lines[i].trim().substring(0, 50)}..."`;
        break;
      }
    }

    // Report error
    await writeThinkingStep.call(this, {
      step_number: Date.now(),
      tool_name: 'str_replace_file',
      status: 'error',
      message: `Could not find search text in ${filePath}`,
      details: { filePath, error: 'Search text not found', hint }
    });

    return 'Error: Search text not found. Must match EXACTLY (case-sensitive).' + hint;
  }

  // Replace
  const newContent = content.replace(search, replace);

  // STEP 4: Write to preview workspace
  const previewResponse = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://preview-orchestrator.fly.dev/preview/write',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, filePath, content: newContent }),
    timeout: 15000
  });

  if (!previewResponse.ok) {
    await writeThinkingStep.call(this, {
      step_number: Date.now(),
      tool_name: 'str_replace_file',
      status: 'error',
      message: `Failed to write ${filePath}`,
      details: { filePath, error: previewResponse.message }
    });

    return 'Error: Failed to write to preview: ' + (previewResponse.message || 'Unknown error');
  }

  // STEP 5: Report success
  await writeThinkingStep.call(this, {
    step_number: Date.now(),
    tool_name: 'str_replace_file',
    status: 'complete',
    message: `✓ Modified ${filePath}`,
    details: { filePath, changes: 1 }
  });

  return JSON.stringify({
    success: true,
    file: filePath,
    action: 'updated_in_preview',
    message: 'File updated in preview workspace'
  });

} catch (e) {
  await writeThinkingStep.call(this, {
    step_number: Date.now(),
    tool_name: 'str_replace_file',
    status: 'error',
    message: `Error: ${e.message}`,
    details: { filePath, error: e.message }
  });

  return e.message.includes('404') ? 'Error: File not found: ' + filePath : 'Error: ' + e.message;
}
