// Tool Handler: list_files
// This runs when the AI agent calls the list_files tool

const ctx = $input.first().json;
const pattern = ctx.pattern;

// Get site info from context
const site = $('Build Context').item.json.site;
const owner = site.owner;
const repo = site.repo;
const branch = site.default_branch || 'main';

// Convert glob pattern to GitHub search
// e.g., "src/**/*.css" -> "path:src extension:css"
let searchQuery = '';

// Extract directory path
const pathMatch = pattern.match(/^([^*]+)/);
if (pathMatch) {
  searchQuery += `path:${pathMatch[1]}`;
}

// Extract file extension
const extMatch = pattern.match(/\*\.(\w+)$/);
if (extMatch) {
  searchQuery += `+extension:${extMatch[1]}`;
}

// Build full query
const query = `repo:${owner}/${repo}+${searchQuery}`;

return [{
  json: {
    url: `https://api.github.com/search/code`,
    method: 'GET',
    qs: {
      q: query,
      per_page: 100
    },
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  }
}];
