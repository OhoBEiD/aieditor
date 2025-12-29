const originalCtx = $('Merge Fly Response').item.json;
const items = $input.all();
const fileContents = {};

items.forEach(item => {
  const path = item.json.currentFetchPath;
  if (item.json.content) {
    try {
      fileContents[path] = Buffer.from(item.json.content, 'base64').toString('utf8');
    } catch (e) {
      fileContents[path] = '// Error decoding file';
    }
  }
});

// Fetch conversation history from messages table using session_id
let conversationHistory = [];
try {
  // First get the chat_session by id (conversationId)
  const sessionId = originalCtx.conversationId || originalCtx.sessionId;
  if (sessionId) {
    const msgResp = await fetch(
      `https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/messages?session_id=eq.${sessionId}&select=role,content,created_at&order=created_at.asc&limit=20`,
      {
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4'
        }
      }
    );
    const messages = await msgResp.json();
    if (Array.isArray(messages)) {
      conversationHistory = messages.map(m => ({ role: m.role, content: m.content }));
    }
  }
} catch (e) {
  console.log('Could not fetch conversation history:', e);
}

return [{ json: { ...originalCtx, fileContents, conversationHistory } }];
