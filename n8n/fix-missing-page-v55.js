// Fix executor to ensure app/page.tsx is always created
const fs = require('fs');

const workflow = JSON.parse(fs.readFileSync('./FIXED-AGENT-WORKFLOW-V54-API-FIX.json', 'utf8'));

// Find Agent 3: Executor and update the prompt
const executorNode = workflow.nodes.find(n => n.name === 'Agent 3: Executor');
if (executorNode) {
    let code = executorNode.parameters.jsCode;

    // Update the prompt to be more explicit about required files
    const oldPromptStart = `let prompt = 'Expert Next.js/React dev. IMPORTANT RULES:\\n' +
'1. Use write_file for new files, str_replace for edits.\\n' +
'2. Create beautiful modern UIs with Tailwind CSS.\\n' +
'3. For ANY images, you MUST call generate_image tool first to get an Unsplash URL, then use that exact URL in your code.\\n' +
'   Example: Call generate_image({prompt: \\"modern furniture\\"}) -> returns {imageUrl: \\"https://source.unsplash.com/...\\"}\\n' +
'   Then use that URL directly: <img src=\\"https://source.unsplash.com/...\\" /> or Image src=\\"https://source.unsplash.com/...\\"\\n' +
'4. NEVER use local image paths like /image.jpg - always use the URLs returned by generate_image.\\n' +
'5. For Next.js Image components, use unoptimized={true} for external URLs.\\n' +
'USER REQUEST: ' + ctx.message + '\\n';`;

    const newPromptStart = `let prompt = 'Expert Next.js 14 developer. You MUST create a complete working app.\\n\\n' +
'CRITICAL REQUIREMENTS:\\n' +
'1. ALWAYS create app/page.tsx FIRST - this is the main page that renders the UI\\n' +
'2. Create app/layout.tsx with proper HTML structure\\n' +
'3. Create app/globals.css with Tailwind directives (@tailwind base, components, utilities)\\n' +
'4. Create package.json with: next, react, react-dom, tailwindcss, postcss, autoprefixer\\n' +
'5. Create tailwind.config.js (NOT .ts) with content paths\\n' +
'\\n' +
'FILE CREATION ORDER:\\n' +
'1. package.json\\n' +
'2. tailwind.config.js\\n' +
'3. app/globals.css\\n' +
'4. app/layout.tsx\\n' +
'5. app/page.tsx (MOST IMPORTANT - contains the actual UI)\\n' +
'\\n' +
'IMAGE RULES:\\n' +
'- For images, call generate_image tool to get Unsplash URL\\n' +
'- Use that URL directly in img src or next/image with unoptimized={true}\\n' +
'- NEVER use local paths like /image.jpg\\n' +
'\\n' +
'USER REQUEST: ' + ctx.message + '\\n';`;

    if (code.includes("let prompt = 'Expert Next.js/React dev.")) {
        code = code.replace(
            /let prompt = 'Expert Next\.js\/React dev\. IMPORTANT RULES:[^;]+;/s,
            newPromptStart
        );
        console.log('✅ Updated executor prompt to require app/page.tsx');
    } else {
        console.log('⚠️ Could not find prompt section to update');
    }

    // Also update the NEW PROJECT instruction
    code = code.replace(
        `if (tasks.length === 0) prompt += 'NEW PROJECT: Create files starting with src/app/page.tsx\\n';`,
        `if (tasks.length === 0) prompt += 'NEW PROJECT: Create these files in order: package.json, tailwind.config.js, app/globals.css, app/layout.tsx, app/page.tsx\\n';`
    );
    console.log('✅ Updated NEW PROJECT instruction');

    executorNode.parameters.jsCode = code;
}

// Also update Agent 2: Planner to include app/page.tsx in fallback plan
const plannerNode = workflow.nodes.find(n => n.name === 'Agent 2: Planner');
if (plannerNode) {
    let code = plannerNode.parameters.jsCode;

    // Update fallback plan to include page.tsx
    code = code.replace(
        `{ id: 2, type: 'create_batch', files: ['app/layout.tsx', 'app/globals.css', 'app/page.tsx'], description: 'Create base app structure' }`,
        `{ id: 2, type: 'create_batch', files: ['app/layout.tsx', 'app/globals.css', 'app/page.tsx'], description: 'Create layout, styles, and MAIN PAGE' }`
    );

    // Make sure page.tsx is explicitly mentioned
    code = code.replace(
        `files: ['package.json', 'tsconfig.json', 'next.config.js', 'tailwind.config.ts']`,
        `files: ['package.json', 'tailwind.config.js', 'postcss.config.js']`
    );

    plannerNode.parameters.jsCode = code;
    console.log('✅ Updated planner fallback to emphasize page.tsx');
}

// Save as V55
fs.writeFileSync('./FIXED-AGENT-WORKFLOW-V55-PAGE-FIX.json', JSON.stringify(workflow, null, 2));
console.log('✅ Created FIXED-AGENT-WORKFLOW-V55-PAGE-FIX.json');
console.log('');
console.log('Key fix: Executor now explicitly requires app/page.tsx to be created');
console.log('The prompt now lists the exact files needed and their creation order');
