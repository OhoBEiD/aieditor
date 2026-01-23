// Fix API error handling and syntax issues in V53
const fs = require('fs');

const workflow = JSON.parse(fs.readFileSync('./FIXED-AGENT-WORKFLOW-V53-IMAGE-FIX.json', 'utf8'));

// Fix 1: Syntax error in Fast Executor - missing parenthesis
const fastExecutorNode = workflow.nodes.find(n => n.name === 'Fast Executor');
if (fastExecutorNode) {
    let code = fastExecutorNode.parameters.jsCode;
    // Fix the syntax error: if (name === 'str_replace' { -> if (name === 'str_replace') {
    code = code.replace(
        `if (name === 'str_replace' {`,
        `if (name === 'str_replace') {`
    );
    fastExecutorNode.parameters.jsCode = code;
    console.log('✅ Fixed syntax error in Fast Executor');
}

// Fix 2: Better error handling in Agent 3: Executor
const executorNode = workflow.nodes.find(n => n.name === 'Agent 3: Executor');
if (executorNode) {
    let code = executorNode.parameters.jsCode;

    // Replace the API call section with better error handling and retry logic
    const oldApiSection = `const r = await this.helpers.httpRequest({
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        'Authorization': 'Bearer ' + OPENROUTER_KEY,
        'HTTP-Referer': 'https://n8n.io',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, temperature: 0.2 }),
      timeout: 60000,
      json: true,
      ignoreHttpStatusErrors: true,
      returnFullResponse: true
    });

    if (r.statusCode >= 400) {
      output = 'API Error: ' + (r.body?.error?.message || JSON.stringify(r.body));
      break;
    }`;

    const newApiSection = `// Try primary model first, fallback to secondary if fails
    let r;
    let currentModel = MODEL;
    const FALLBACK_MODEL = 'anthropic/claude-3-haiku';

    try {
      r = await this.helpers.httpRequest({
        method: 'POST',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: {
          'Authorization': 'Bearer ' + OPENROUTER_KEY,
          'HTTP-Referer': 'https://n8n.io',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model: currentModel, messages, tools: TOOLS, temperature: 0.2 }),
        timeout: 60000,
        json: true,
        ignoreHttpStatusErrors: true,
        returnFullResponse: true
      });

      // If primary model fails, try fallback
      if (r.statusCode >= 400) {
        console.log('Primary model failed, trying fallback...');
        currentModel = FALLBACK_MODEL;
        r = await this.helpers.httpRequest({
          method: 'POST',
          url: 'https://openrouter.ai/api/v1/chat/completions',
          headers: {
            'Authorization': 'Bearer ' + OPENROUTER_KEY,
            'HTTP-Referer': 'https://n8n.io',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ model: currentModel, messages, tools: TOOLS, temperature: 0.2 }),
          timeout: 60000,
          json: true,
          ignoreHttpStatusErrors: true,
          returnFullResponse: true
        });
      }
    } catch (apiErr) {
      console.error('API request failed:', apiErr.message);
      output = 'API connection error: ' + apiErr.message;
      break;
    }

    if (r.statusCode >= 400) {
      const errMsg = r.body?.error?.message || r.body?.error?.code || JSON.stringify(r.body).slice(0, 200);
      output = 'API Error (' + r.statusCode + '): ' + errMsg;
      break;
    }`;

    if (code.includes('const r = await this.helpers.httpRequest({')) {
        // Use a simpler replacement approach - find and replace the key patterns
        code = code.replace(
            /const r = await this\.helpers\.httpRequest\(\{[\s\S]*?returnFullResponse: true\s*\}\);[\s\S]*?if \(r\.statusCode >= 400\) \{[\s\S]*?break;\s*\}/,
            newApiSection
        );
        console.log('✅ Added fallback model and better error handling to Executor');
    } else {
        console.log('⚠️ Could not find API call section to update');
    }

    executorNode.parameters.jsCode = code;
}

// Save as V54
fs.writeFileSync('./FIXED-AGENT-WORKFLOW-V54-API-FIX.json', JSON.stringify(workflow, null, 2));
console.log('✅ Created FIXED-AGENT-WORKFLOW-V54-API-FIX.json');
console.log('');
console.log('Fixes applied:');
console.log('1. Fixed syntax error in Fast Executor (missing parenthesis)');
console.log('2. Added fallback model (Claude Haiku) if Gemini fails');
console.log('3. Better error messages showing status code and error details');
