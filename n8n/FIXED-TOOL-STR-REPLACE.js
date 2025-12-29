// Fixed str_replace_file tool - works with preview workspace
// Get raw input - format: filePath|||search|||replace
const rawInput = $fromAI('query', 'filePath|||search|||replace', 'string') || '';
const parts = rawInput.split('|||');

if (parts.length < 3) return 'Error: Use format filePath|||searchText|||replaceText';

const filePath = parts[0].trim().replace(/^\/+/, '');
const search = parts[1];
const replace = parts.slice(2).join('|||'); // In case replace has |||

if (!filePath) return 'Error: filePath required';
if (!search) return 'Error: searchText required';

const ctx = $('Merge Files')?.item?.json || {};
const { owner, repo, branch } = ctx;
const siteId = ctx.site?.id;
if (!siteId) return 'Error: No site context';
if (!owner) return 'Error: No repository context';

try {
  // First, try to read from preview workspace
  let content;
  let sha;

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
    sha = response.sha;
  }

  // Check if search exists
  if (!content.includes(search)) {
    const lines = content.split('\n');
    let hint = '';
    const searchLower = search.toLowerCase().substring(0, 20);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(searchLower)) {
        hint = ` Similar at line ${i+1}: "${lines[i].trim().substring(0, 50)}..."`;
        break;
      }
    }
    return 'Error: Search text not found. Must match EXACTLY (case-sensitive).' + hint;
  }

  // Replace
  const newContent = content.replace(search, replace);

  // Write to preview workspace
  const previewResponse = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://preview-orchestrator.fly.dev/preview/write',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, filePath, content: newContent }),
    timeout: 15000
  });

  if (!previewResponse.ok) {
    return 'Error: Failed to write to preview: ' + (previewResponse.message || 'Unknown error');
  }

  return JSON.stringify({
    success: true,
    file: filePath,
    action: 'updated_in_preview',
    message: 'File updated in preview workspace'
  });

} catch (e) {
  return e.message.includes('404') ? 'Error: File not found: ' + filePath : 'Error: ' + e.message;
}
