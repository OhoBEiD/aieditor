// Fix "No response" issue - switch to Claude as primary model since Gemini is failing
const fs = require('fs');

const workflow = JSON.parse(fs.readFileSync('./FIXED-AGENT-WORKFLOW-V55-PAGE-FIX.json', 'utf8'));

// Find Agent 3: Executor and switch model
const executorNode = workflow.nodes.find(n => n.name === 'Agent 3: Executor');
if (executorNode) {
    let code = executorNode.parameters.jsCode;

    // Switch primary model from Gemini to Claude Sonnet (more reliable)
    // Gemini seems to be having issues on OpenRouter
    code = code.replace(
        `const MODEL = 'google/gemini-3-flash-preview';`,
        `const MODEL = 'anthropic/claude-3.5-sonnet';  // Switched from Gemini (was failing)`
    );
    console.log('✅ Switched executor primary model to Claude 3.5 Sonnet');

    // Also increase the loop iterations to allow more tool calls
    code = code.replace(
        `for (let i = 0; i < 6; i++) {`,
        `for (let i = 0; i < 10; i++) {  // Increased from 6 to allow more file creations`
    );
    console.log('✅ Increased iteration limit from 6 to 10');

    // Add better error logging when message is empty
    code = code.replace(
        `const msg = r.body?.choices?.[0]?.message;\n    if (!msg) { output = 'No response'; break; }`,
        `const msg = r.body?.choices?.[0]?.message;
    if (!msg) {
      console.error('Empty message from API. Response:', JSON.stringify(r.body).slice(0, 500));
      output = 'No response from model. Check API status.';
      break;
    }`
    );
    console.log('✅ Added better error logging for empty responses');

    executorNode.parameters.jsCode = code;
}

// Also fix Fast Executor
const fastExecutorNode = workflow.nodes.find(n => n.name === 'Fast Executor');
if (fastExecutorNode) {
    let code = fastExecutorNode.parameters.jsCode;
    code = code.replace(
        `const MODEL = 'google/gemini-3-flash-preview';`,
        `const MODEL = 'anthropic/claude-3.5-sonnet';`
    );
    fastExecutorNode.parameters.jsCode = code;
    console.log('✅ Switched Fast Executor model to Claude 3.5 Sonnet');
}

// Also fix Question Responder and Intent Classifier to use working models
const questionNode = workflow.nodes.find(n => n.name === 'Question Responder');
if (questionNode) {
    let code = questionNode.parameters.jsCode;
    code = code.replace(
        `const MODEL = 'google/gemini-3-flash-preview';`,
        `const MODEL = 'anthropic/claude-3-haiku';  // Faster and reliable`
    );
    questionNode.parameters.jsCode = code;
    console.log('✅ Switched Question Responder to Claude Haiku');
}

const intentNode = workflow.nodes.find(n => n.name === 'Agent 1: Intent Classifier');
if (intentNode) {
    let code = intentNode.parameters.jsCode;
    code = code.replace(
        `model: 'google/gemini-3-flash-preview'`,
        `model: 'anthropic/claude-3-haiku'`
    );
    intentNode.parameters.jsCode = code;
    console.log('✅ Switched Intent Classifier to Claude Haiku');
}

// Save as V56
fs.writeFileSync('./FIXED-AGENT-WORKFLOW-V56-CLAUDE-MODEL.json', JSON.stringify(workflow, null, 2));
console.log('');
console.log('✅ Created FIXED-AGENT-WORKFLOW-V56-CLAUDE-MODEL.json');
console.log('');
console.log('Changes:');
console.log('1. Switched Agent 3: Executor from Gemini to Claude 3.5 Sonnet');
console.log('2. Switched Fast Executor from Gemini to Claude 3.5 Sonnet');
console.log('3. Switched Question Responder to Claude Haiku');
console.log('4. Switched Intent Classifier to Claude Haiku');
console.log('5. Increased executor iteration limit from 6 to 10');
console.log('6. Added better error logging for debugging');
console.log('');
console.log('The Gemini models on OpenRouter appear to be having issues.');
console.log('Claude models via OpenRouter should be more reliable.');
