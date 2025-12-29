// Fixed write_file tool - writes to PREVIEW WORKSPACE first, then optionally to GitHub
// Get raw input - format: filePath|||content
const rawInput = $fromAI('query', 'filePath|||content', 'string') || '';
const parts = rawInput.split('|||');

if (parts.length < 2) return 'Error: Use format filePath|||content';

const filePath = parts[0].trim().replace(/^\/+/, '');
const content = parts.slice(1).join('|||'); // In case content has |||

if (!filePath) return 'Error: filePath required';

const ctx = $('Merge Files')?.item?.json || {};
const { owner, repo, branch } = ctx;
const siteId = ctx.site?.id;
if (!siteId) return 'Error: No site context';

try {
  // CRITICAL: Write to preview workspace first (this is what user sees)
  const previewResponse = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://preview-orchestrator.fly.dev/preview/write',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, filePath, content }),
    timeout: 15000
  });

  if (!previewResponse.ok) {
    return 'Error: Failed to write to preview: ' + (previewResponse.message || 'Unknown error');
  }

  // Success - file written to preview workspace
  // GitHub commit will happen later when user clicks "Accept Changes"
  return JSON.stringify({
    success: true,
    file: filePath,
    action: 'created_in_preview',
    message: 'File written to preview workspace. Changes will be committed when you accept them.'
  });

} catch (e) {
  return 'Error: ' + e.message;
}
