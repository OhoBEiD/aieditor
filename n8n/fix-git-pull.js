const fs = require('fs');

const filePath = '/Users/omarobeid/Desktop/aieditor/n8n/FIXED-AGENT-WORKFLOW-V15.json';
const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Find Git Pull node and fix the jsCode
const gitPullNode = workflow.nodes.find(n => n.name === 'Git Pull');
if (gitPullNode) {
    gitPullNode.parameters.jsCode = `// Pull latest changes from Git to preview workspace
// This syncs the preview with GitHub commits made by the AI
const ctx = $input.item.json;
const siteId = ctx.site?.id;

if (!siteId) {
  console.log('⚠️ No siteId found, skipping git pull');
  return [{ json: ctx }];
}

console.log(\`🔄 Pulling latest for \${siteId}...\`);
// Reduced delay - GitHub is usually fast
await new Promise(resolve => setTimeout(resolve, 1000));

try {
  const result = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://preview-orchestrator.fly.dev/preview/pull',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      siteId, 
      clearCache: true, 
      restart: true,
      retries: 2
    }),
    timeout: 30000
  });
  console.log(\`✅ Git pull result for \${siteId}:\`, JSON.stringify(result));
  return [{ json: ctx }];
} catch (e) {
  console.error(\`❌ Git pull failed for \${siteId}:\`, e.message);
  return [{ json: ctx }];
}`;
    console.log('✅ Fixed Git Pull node jsCode');
} else {
    console.error('❌ Git Pull node not found');
}

fs.writeFileSync(filePath, JSON.stringify(workflow, null, 4));
