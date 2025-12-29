// Tool Handler: search_code
// This runs when the AI agent calls the search_code tool

const ctx = $input.first().json;
const pattern = ctx.pattern;
const fileTypes = ctx.fileTypes || [];
const caseSensitive = ctx.caseSensitive || false;

// Get site info from context
const site = $('Build Context').item.json.site;
const owner = site.owner;
const repo = site.repo;
const branch = site.default_branch || 'main';

// Build file type filter for GitHub API
let fileExtension = '';
if (fileTypes && fileTypes.length > 0) {
  fileExtension = '+extension:' + fileTypes.join('+extension:');
}

// GitHub Code Search API query
const query = `${pattern}+repo:${owner}/${repo}${fileExtension}`;

// Return search request parameters
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
