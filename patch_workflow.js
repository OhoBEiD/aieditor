
const fs = require('fs');
const path = './n8n/FIXED-AGENT-WORKFLOW-V48-ULTRA-OPTIMIZED.json';

try {
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));
    let patched = false;

    const ensureCode = `const githubToken = ctx.githubToken;
const ensurePreview = async () => {
  if (!siteId) return false;
  try {
    const status = await this.helpers.httpRequest({ method: 'GET', url: 'https://preview-orchestrator.fly.dev/preview/status/' + siteId, timeout: 3000, json: true, ignoreHttpStatusErrors: true });
    if (status?.status === 'running') return true;
    await this.helpers.httpRequest({ method: 'POST', url: 'https://preview-orchestrator.fly.dev/preview/start', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId, repoUrl: ctx.site.repo_url, gitToken: githubToken }), timeout: 30000, ignoreHttpStatusErrors: true });
    await new Promise(r => setTimeout(r, 2000));
    return true;
  } catch { return false; }
};
await ensurePreview();`;

    for (const node of data.nodes) {
        if (node.name === 'Agent 2: Planner') {
            let code = node.parameters.jsCode;
            const target = 'const siteId = ctx.site?.id;';

            if (code.includes(target) && !code.includes('ensurePreview')) {
                // Insert after target
                // We must properly escape newlines for the JSON string value
                // Actually, since we parsed the JSON, 'code' is the actual JS string.
                // We just insert the JS string into it.

                const insertion = '\n' + ensureCode + '\n';
                node.parameters.jsCode = code.replace(target, target + insertion);
                patched = true;
                console.log('Patched Agent 2: Planner');
            } else if (code.includes('ensurePreview')) {
                console.log('Already patched');
                patched = true;
            }
        }
    }

    if (patched) {
        fs.writeFileSync(path, JSON.stringify(data, null, 2));
        console.log('Saved updated workflow');
    } else {
        console.log('Target node or string not found');
    }

} catch (e) {
    console.error('Error:', e);
}
