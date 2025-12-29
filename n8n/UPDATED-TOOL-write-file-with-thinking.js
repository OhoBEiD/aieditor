// Updated write_file tool - WITH THINKING STEP REPORTING
// This replaces your existing write_file tool in the V12 Delimiter workflow

// Configuration
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Get raw input - format: filePath|||content
const rawInput = $fromAI('query', 'filePath|||content', 'string') || '';
const parts = rawInput.split('|||');

if (parts.length < 2) return 'Error: Use format filePath|||content';

const filePath = parts[0].trim().replace(/^\\/+/, '');
const content = parts.slice(1).join('|||'); // In case content has |||

if (!filePath) return 'Error: filePath required';

const ctx = $('Merge Files')?.item?.json || {};
const siteId = ctx.site?.id;
const requestId = ctx.requestId;
const conversationId = ctx.conversationId;

if (!siteId) return 'Error: No site context';

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
    // Don't fail tool if thinking step fails
    console.error('Failed to write thinking step:', e.message);
  }
}

try {
  // STEP 1: Report that we're starting
  await writeThinkingStep.call(this, {
    step_number: Date.now(), // Use timestamp as unique step number
    tool_name: 'write_file',
    status: 'running',
    message: `Creating file: ${filePath}`,
    details: { filePath, contentLength: content.length }
  });

  // STEP 2: Write to preview workspace
  const previewResponse = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://preview-orchestrator.fly.dev/preview/write',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, filePath, content }),
    timeout: 15000
  });

  if (!previewResponse.ok) {
    // STEP 3a: Report error
    await writeThinkingStep.call(this, {
      step_number: Date.now(),
      tool_name: 'write_file',
      status: 'error',
      message: `Failed to create ${filePath}`,
      details: { filePath, error: previewResponse.message }
    });

    return 'Error: Failed to write to preview: ' + (previewResponse.message || 'Unknown error');
  }

  // STEP 3b: Report success
  await writeThinkingStep.call(this, {
    step_number: Date.now(),
    tool_name: 'write_file',
    status: 'complete',
    message: `✓ Created ${filePath}`,
    details: { filePath, contentLength: content.length }
  });

  // Success - file written to preview workspace
  return JSON.stringify({
    success: true,
    file: filePath,
    action: 'created_in_preview',
    message: 'File written to preview workspace'
  });

} catch (e) {
  // Report error
  await writeThinkingStep.call(this, {
    step_number: Date.now(),
    tool_name: 'write_file',
    status: 'error',
    message: `Error creating ${filePath}: ${e.message}`,
    details: { filePath, error: e.message }
  });

  return 'Error: ' + e.message;
}
