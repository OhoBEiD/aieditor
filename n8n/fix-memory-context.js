// Fix Fetch Memory to query messages table instead of agent_memory
const fs = require('fs');

const SUPABASE_URL = 'https://jjrbnjubjiswvxeradzw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4';

const workflow = JSON.parse(fs.readFileSync('./FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json', 'utf8'));

// Find Fetch Memory node
const fetchMemoryNode = workflow.nodes.find(n => n.name === 'Fetch Memory');
if (fetchMemoryNode) {
    // New code that queries MESSAGES table directly using conversationId (session_id)
    const newCode = `// FETCH MEMORY - Query messages table for conversation history
const ctx = $input.item.json;
const siteId = ctx.site?.uuid;
const requestId = ctx.requestId || 'unknown';
const conversationId = ctx.conversationId || null;

// Insert initial thinking step
try {
  await this.helpers.httpRequest({
    method: 'POST',
    url: '${SUPABASE_URL}/rest/v1/thinking_steps',
    headers: {
      'apikey': '${SUPABASE_KEY}',
      'Authorization': 'Bearer ${SUPABASE_KEY}',
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      request_id: requestId,
      site_id: siteId,
      conversation_id: conversationId,
      step_number: 1,
      tool_name: 'analyze',
      status: 'running',
      message: 'Analyzing request...',
      details: { message: ctx.message?.substring(0, 100) }
    }),
    timeout: 5000
  });
} catch (e) { console.log('Initial thinking step error:', e.message); }

// If no conversationId, return empty context
if (!conversationId) {
  console.log('📝 No conversationId, starting fresh');
  return [{ json: { ...ctx, memoryContext: 'First request - no conversation history.' } }];
}

try {
  // Query messages table directly using session_id (conversationId)
  const messagesUrl = '${SUPABASE_URL}/rest/v1/messages?session_id=eq.' + conversationId + '&order=created_at.desc&limit=10';

  const response = await this.helpers.httpRequest({
    method: 'GET',
    url: messagesUrl,
    headers: {
      'apikey': '${SUPABASE_KEY}',
      'Authorization': 'Bearer ${SUPABASE_KEY}'
    },
    timeout: 10000
  });

  let memoryContext = 'First request in session.';
  if (Array.isArray(response) && response.length > 0) {
    // Reverse to get chronological order (oldest first)
    const messages = response.reverse();
    memoryContext = 'Recent conversation:\\n' + messages.map(m => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const content = (m.content || '').slice(0, 150);
      const meta = m.metadata || {};
      const files = (meta.filesModified || meta.filesCreated || meta.filesChanged || []).map(f => f.split('/').pop()).join(', ');
      if (files) {
        return '- ' + role + ': ' + content + ' [Files: ' + files + ']';
      }
      return '- ' + role + ': ' + content;
    }).join('\\n');
  }

  console.log('📝 Memory loaded from messages:', response.length || 0, 'messages');
  return [{ json: { ...ctx, memoryContext } }];
} catch (e) {
  console.error('Memory fetch error:', e.message);
  return [{ json: { ...ctx, memoryContext: 'First request.' } }];
}`;

    fetchMemoryNode.parameters.jsCode = newCode;
    console.log('✅ Updated Fetch Memory to query messages table');
}

// Save
fs.writeFileSync('./FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json', JSON.stringify(workflow, null, 2));
console.log('✅ Saved updated workflow');
console.log('📋 Re-import FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json into n8n');
