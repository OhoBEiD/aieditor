// Revert generate_image to use nice placeholder/stock images
// instead of expensive Gemini 2.5 image generation

const fs = require('fs');

const workflow = JSON.parse(fs.readFileSync('./FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json', 'utf8'));

const executorNode = workflow.nodes.find(n => n.name === 'Agent 3: Executor');
if (!executorNode) {
    console.error('❌ Executor not found');
    process.exit(1);
}

let code = executorNode.parameters.jsCode;

// Replace the generate_image implementation with simpler placeholder approach
const oldImageCode = `if (name === 'generate_image') {
    await emitStep('generate_image', 'running', 'Generating image: ' + input.prompt?.substring(0, 50));
    try {
      const r = await this.helpers.httpRequest({
        method: 'POST',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: {
          'Authorization': 'Bearer ' + OPENROUTER_KEY,
          'HTTP-Referer': 'https://n8n.io',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image',
          messages: [{ role: 'user', content: 'Generate an image: ' + input.prompt }]
        }),
        timeout: 60000,
        json: true
      });
      const message = r.choices?.[0]?.message;
      const content = message?.content;
      // Handle base64 images
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === 'image' && part.source?.type === 'base64') {
            const fileName = input.fileName || 'generated-' + Date.now() + '.png';
            const mediaType = part.source.media_type || 'image/png';
            fileOperations.push({
              type: 'write',
              path: 'public/images/' + fileName,
              content: 'data:' + mediaType + ';base64,' + part.source.data,
              isBase64: true
            });
            await emitStep('generate_image', 'complete', 'Generated: ' + fileName);
            return JSON.stringify({ imageUrl: '/images/' + fileName, success: true });
          }
        }
      }
      // Fallback placeholder
      await emitStep('generate_image', 'complete', 'Using placeholder');
      const placeholderText = encodeURIComponent(input.prompt?.substring(0, 40) || 'Image');
      return JSON.stringify({ imageUrl: 'https://placehold.co/800x600/2563eb/ffffff?text=' + placeholderText, fallback: true });
    } catch (e) {
      await emitStep('generate_image', 'error', 'Error: ' + e.message.substring(0, 50));
      return JSON.stringify({ error: e.message });
    }
  }`;

const newImageCode = `if (name === 'generate_image') {
    await emitStep('generate_image', 'running', 'Finding image: ' + input.prompt?.substring(0, 50));
    
    // Use high-quality Unsplash images based on keywords
    const prompt = (input.prompt || 'furniture').toLowerCase();
    let imageUrl = '';
    
    // Map common keywords to Unsplash search terms
    const keywords = [];
    if (prompt.includes('hero') || prompt.includes('banner')) keywords.push('modern-interior');
    if (prompt.includes('chair')) keywords.push('chair,furniture');
    if (prompt.includes('desk') || prompt.includes('table')) keywords.push('desk,office');
    if (prompt.includes('bed') || prompt.includes('bedroom')) keywords.push('bedroom,bed');
    if (prompt.includes('sofa') || prompt.includes('couch')) keywords.push('sofa,living-room');
    if (prompt.includes('furniture')) keywords.push('furniture,interior-design');
    if (prompt.includes('kitchen')) keywords.push('kitchen,modern');
    if (prompt.includes('living')) keywords.push('living-room,interior');
    if (prompt.includes('office')) keywords.push('office,workspace');
    if (keywords.length === 0) keywords.push('furniture,home');
    
    const searchTerm = keywords[0];
    const randomSeed = Math.floor(Math.random() * 1000);
    
    // Use Unsplash Source for high-quality images (free, no API key needed)
    imageUrl = 'https://source.unsplash.com/800x600/?' + encodeURIComponent(searchTerm) + '&sig=' + randomSeed;
    
    await emitStep('generate_image', 'complete', 'Found image for: ' + searchTerm);
    return JSON.stringify({ imageUrl: imageUrl, success: true, source: 'unsplash' });
  }`;

// Find and replace the generate_image section
if (code.includes("if (name === 'generate_image')")) {
    // Find the start of generate_image
    const startIndex = code.indexOf("if (name === 'generate_image')");
    // Find the end (next 'return' after the closing brace pattern for this if block)

    // Simple approach: replace the entire generate_image block
    code = code.replace(/if \(name === 'generate_image'\) \{[\s\S]*?return JSON\.stringify\(\{ error: e\.message \}\);\s*\}\s*\}/m, newImageCode);
}

executorNode.parameters.jsCode = code;
console.log('✅ Updated generate_image to use Unsplash (free, fast, high-quality)');

// Save
fs.writeFileSync('./FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json', JSON.stringify(workflow, null, 2));
console.log('✅ Saved workflow');
console.log('');
console.log('📋 generate_image now uses:');
console.log('  - Unsplash Source API (free, no key needed)');
console.log('  - Smart keyword mapping for relevant images');
console.log('  - Fast response (no AI generation wait)');
