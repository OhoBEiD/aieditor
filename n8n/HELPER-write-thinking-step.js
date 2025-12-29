// N8N Helper Node: Write Thinking Step to Supabase
// Add this as a "Code" node after each significant step in your workflow
// Connect this node BEFORE the actual tool execution to show "pending" status
// Then update to "complete" or "error" after tool execution

// Configuration - UPDATE THESE VALUES
const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // e.g., https://xxx.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Get context from previous nodes
const ctx = $('Merge Files')?.item?.json || {};
const requestId = ctx.requestId || 'unknown';
const conversationId = ctx.conversationId || null;
const siteId = ctx.site?.id || 'unknown';

// Input parameters - customize for each node
const stepNumber = $input.first().json.stepNumber || 1;
const toolName = $input.first().json.toolName || 'unknown'; // e.g., 'write_file', 'read_file', 'ai_agent'
const status = $input.first().json.status || 'pending'; // 'pending', 'running', 'complete', 'error'
const message = $input.first().json.message || 'Processing...';
const details = $input.first().json.details || {}; // Any additional data (file path, error message, etc.)

try {
  // Write thinking step to Supabase
  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: `${SUPABASE_URL}/rest/v1/thinking_steps`,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      request_id: requestId,
      conversation_id: conversationId,
      site_id: siteId,
      step_number: stepNumber,
      tool_name: toolName,
      status: status,
      message: message,
      details: details
    }),
    timeout: 5000
  });

  return {
    success: true,
    thinkingStepId: response[0]?.id,
    message: 'Thinking step recorded'
  };

} catch (error) {
  // Don't fail the workflow if thinking step write fails
  console.error('Failed to write thinking step:', error.message);
  return {
    success: false,
    error: error.message,
    message: 'Failed to record thinking step (non-critical)'
  };
}
