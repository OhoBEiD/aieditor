// Fix executor to use external image URLs instead of local paths
// The generate_image tool returns Unsplash URLs, but AI generates code with local paths
const fs = require('fs');

const workflow = JSON.parse(fs.readFileSync('./FIXED-AGENT-WORKFLOW-V52-WITH-GIT-PUSH.json', 'utf8'));

// Find Agent 3: Executor
const executorNode = workflow.nodes.find(n => n.name === 'Agent 3: Executor');
if (!executorNode) {
    console.error('❌ Executor node not found');
    process.exit(1);
}

let code = executorNode.parameters.jsCode;

// Find and replace the prompt building section
// The key issue is the prompt doesn't tell the AI to use generate_image for images
// and to use the returned URLs directly

// Replace the prompt building section
const oldPromptSection = `let prompt = 'Expert Next.js dev. Rules: Use write_file for new files, str_replace for edits. Create beautiful modern UIs with Tailwind.\\nUSER REQUEST: ' + ctx.message + '\\n';`;

const newPromptSection = `let prompt = 'Expert Next.js/React dev. IMPORTANT RULES:\\n' +
'1. Use write_file for new files, str_replace for edits.\\n' +
'2. Create beautiful modern UIs with Tailwind CSS.\\n' +
'3. For ANY images, you MUST call generate_image tool first to get an Unsplash URL, then use that exact URL in your code.\\n' +
'   Example: Call generate_image({prompt: "modern furniture"}) -> returns {imageUrl: "https://source.unsplash.com/..."}\\n' +
'   Then use that URL directly: <img src="https://source.unsplash.com/..." /> or Image src="https://source.unsplash.com/..."\\n' +
'4. NEVER use local image paths like /image.jpg - always use the URLs returned by generate_image.\\n' +
'5. For Next.js Image components, use unoptimized={true} for external URLs.\\n' +
'USER REQUEST: ' + ctx.message + '\\n';`;

if (code.includes(oldPromptSection)) {
    code = code.replace(oldPromptSection, newPromptSection);
    console.log('✅ Updated prompt to require generate_image for all images');
} else {
    // Try a more flexible match
    const promptRegex = /let prompt = 'Expert Next\.js dev\.[^']*' \+ ctx\.message \+ '\\n';/;
    if (promptRegex.test(code)) {
        code = code.replace(promptRegex, newPromptSection);
        console.log('✅ Updated prompt (regex match)');
    } else {
        console.log('⚠️ Could not find prompt section, trying alternate approach');
        // Just prepend instructions about images to the existing prompt
        code = code.replace(
            /let prompt = '/,
            `let prompt = 'CRITICAL: For ANY images, ALWAYS call generate_image first and use the returned Unsplash URL directly in your code (never local paths like /image.jpg). Use unoptimized={true} for Next.js Image with external URLs. `
        );
        console.log('✅ Prepended image instructions to prompt');
    }
}

// Also update the generate_image tool description to be clearer
const oldGenImageDesc = `{ type: 'function', function: { name: 'generate_image', description: 'Generate AI image', parameters: { type: 'object', properties: { prompt: { type: 'string' }, fileName: { type: 'string' } }, required: ['prompt'] } } }`;

const newGenImageDesc = `{ type: 'function', function: { name: 'generate_image', description: 'Get an Unsplash image URL for any image needed. ALWAYS call this for images - returns a ready-to-use URL that you must embed directly in your code (not a local path)', parameters: { type: 'object', properties: { prompt: { type: 'string', description: 'Description of the image needed, e.g. "modern furniture showroom" or "comfortable office chair"' } }, required: ['prompt'] } } }`;

if (code.includes(oldGenImageDesc)) {
    code = code.replace(oldGenImageDesc, newGenImageDesc);
    console.log('✅ Updated generate_image tool description');
} else {
    // Try to update just the description part
    code = code.replace(
        /name: 'generate_image', description: 'Generate AI image'/,
        `name: 'generate_image', description: 'Get an Unsplash image URL - ALWAYS use this for images and embed the returned URL directly in code'`
    );
    console.log('✅ Updated generate_image description (partial match)');
}

executorNode.parameters.jsCode = code;

// Also update Fast Executor with same fix
const fastExecutorNode = workflow.nodes.find(n => n.name === 'Fast Executor');
if (fastExecutorNode) {
    let fastCode = fastExecutorNode.parameters.jsCode;

    // Add generate_image tool to Fast Executor if not present
    if (!fastCode.includes('generate_image')) {
        // Add the tool definition
        fastCode = fastCode.replace(
            `{ type: 'function', function: { name: 'str_replace'`,
            `{ type: 'function', function: { name: 'generate_image', description: 'Get Unsplash image URL - MUST use for all images', parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } } },
  { type: 'function', function: { name: 'str_replace'`
        );

        // Add handler for generate_image in runTool
        fastCode = fastCode.replace(
            `if (name === 'str_replace')`,
            `if (name === 'generate_image') {
    const searchTerm = (input.prompt || 'furniture').toLowerCase().split(' ').slice(0, 2).join(',');
    const url = 'https://source.unsplash.com/800x600/?' + encodeURIComponent(searchTerm) + '&sig=' + Math.floor(Math.random() * 1000);
    return JSON.stringify({ imageUrl: url, success: true });
  }
  if (name === 'str_replace'`
        );

        // Update the prompt
        fastCode = fastCode.replace(
            `'Expert Next.js dev. Make this change: '`,
            `'Expert Next.js dev. IMPORTANT: For images, call generate_image to get Unsplash URL and use it directly (never local paths). Make this change: '`
        );

        fastExecutorNode.parameters.jsCode = fastCode;
        console.log('✅ Updated Fast Executor with generate_image support');
    }
}

// Save as V53
fs.writeFileSync('./FIXED-AGENT-WORKFLOW-V53-IMAGE-FIX.json', JSON.stringify(workflow, null, 2));
console.log('✅ Created FIXED-AGENT-WORKFLOW-V53-IMAGE-FIX.json');
console.log('📋 Import this workflow into n8n to fix image 404 errors');
console.log('');
console.log('Changes made:');
console.log('1. Updated executor prompt to require generate_image for all images');
console.log('2. Updated generate_image tool description to be clearer');
console.log('3. Added generate_image support to Fast Executor');
