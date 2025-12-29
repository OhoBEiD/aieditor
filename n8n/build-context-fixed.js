const inp = $('Validate Input').item.json;
const siteArr = $input.first().json;
const site = Array.isArray(siteArr) ? siteArr[0] : siteArr;
if (!site) throw new Error('Site not found');

// Allow ALL paths - no restrictions
const allowedPaths = ['**/*', 'src/**', 'public/**', '*.html', '*.tsx', '*.ts', '*.css', '*.json'];

const repoUrl = site.repo_url || '';
const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
const owner = match ? match[1] : '';
const repo = match ? match[2].replace(/\.git$/, '') : '';

const defaultFiles = ['src/app/page.tsx', 'src/app/globals.css', 'src/app/layout.tsx', 'index.html'];

return [{
  json: {
    ...inp,
    site: {
      id: site.id,
      name: site.name,
      repo_url: site.repo_url,
      default_branch: site.default_branch || 'main',
      stack: site.stack || 'unknown',
      allowedPaths,
      owner,
      repo
    },
    fileContents: {},
    filesToFetch: defaultFiles,
    sessionId: inp.conversationId
  }
}];
