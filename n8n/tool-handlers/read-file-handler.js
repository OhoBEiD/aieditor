// Tool Handler: read_file
// This runs when the AI agent calls the read_file tool

const ctx = $input.first().json;
const filePath = ctx.filePath;

// Get site info from context
const site = $('Build Context').item.json.site;
const owner = site.owner;
const repo = site.repo;
const branch = site.default_branch || 'main';

// GitHub API endpoint to get file contents
const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

return [{
  json: {
    url: url,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.raw', // Get raw file content, not base64
      'X-GitHub-Api-Version': '2022-11-28'
    }
  }
}];
