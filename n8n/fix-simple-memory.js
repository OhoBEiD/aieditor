const fs = require('fs');

const filePath = '/Users/omarobeid/Desktop/aieditor/n8n/FIXED-AGENT-WORKFLOW-V15.json';
const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const simpleExecutor = workflow.nodes.find(n => n.name === 'Simple Executor');

if (simpleExecutor) {
    const originalPrompt = simpleExecutor.parameters.options.systemMessage;

    // We want to add MEMORY CONTEXT section
    // Current structure: Intro -> Execution Plan -> Files -> Rules
    // New structure: Intro -> Execution Plan -> MEMORY CONTEXT -> Files -> Rules

    // The prompt is complex with .replace() chains.
    // It is easiest to redefine the base string and the replacement logic.

    const newSystemMessage = "={{ 'You are a fast execution agent for simple code changes.\\nYou\\'ve been given a pre-analyzed plan. Execute it quickly.\\n\\n## EXECUTION PLAN\\n{plan}\\n\\n## MEMORY CONTEXT\\n{memoryContext}\\n\\n## FILES IN CONTEXT\\n{fileContents}\\n\\n## RULES\\n1. Follow the plan exactly\\n2. Make minimal changes\\n3. Use str_replace_file for modifications\\n4. Use write_file only for new files'.replace('{plan}', JSON.stringify($json.executionPlan || {})).replace('{memoryContext}', $json.memoryContext || 'No previous context').replace('{fileContents}', Object.keys($json.fileContents || {}).length > 0 ? Object.entries($json.fileContents).map(([path, content]) => '### ' + path + '\\n```\\n' + content.substring(0, 2000) + '\\n```').join('\\n\\n') : 'No files loaded') }}";

    simpleExecutor.parameters.options.systemMessage = newSystemMessage;

    console.log('✅ Simple Executor System Prompt updated with Memory Context');
} else {
    console.error('❌ Simple Executor node not found');
}

fs.writeFileSync(filePath, JSON.stringify(workflow, null, 4));
