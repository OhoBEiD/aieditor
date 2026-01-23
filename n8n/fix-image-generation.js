// Fix generate_image tool to properly handle Gemini image generation response
const fs = require('fs');

const workflow = JSON.parse(fs.readFileSync('./FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json', 'utf8'));

// Find Agent 3: Executor
const executorNode = workflow.nodes.find(n => n.name === 'Agent 3: Executor');
if (executorNode) {
    let code = executorNode.parameters.jsCode;

    // The old generate_image code that tries to parse URLs from text
    const oldImageCode = `if (name === 'generate_image') {
    await emitStep('generate_image', 'running', 'Generating image: ' + input.prompt?.substring(0, 50));
    try { const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions', headers: { 'Authorization': 'Bearer ' + OPENROUTER_KEY, 'HTTP-Referer': 'https://n8n.io', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'google/gemini-2.5-flash-image-preview', messages: [{ role: 'user', content: input.prompt }] }), timeout: 45000, json: true });
      const content = r.choices?.[0]?.message?.content || '';
      const r1 = new RegExp('\\\\\\\\((https?://[^)]+)\\\\\\\\)');
      const r2 = new RegExp('(https?://[^\\\\\\\\s]+)');
      const urlMatch = content.match(r1) || content.match(r2);
      if (urlMatch) {
        await emitStep('generate_image', 'complete', 'Generated image');
        return JSON.stringify({ imageUrl: urlMatch[1] });
      }
      await emitStep('generate_image', 'error', 'Image generation failed');
      return JSON.stringify({ imageUrl: 'https://placehold.co/800x600?text=Generation+Failed', fallback: true, debug: content.slice(0, 50) });
    } catch (e) { return 'ERROR: ' + e.message; }
  }`;

    // New generate_image code that properly handles base64 images and uploads to storage
    const newImageCode = `if (name === 'generate_image') {
    await emitStep('generate_image', 'running', 'Generating image: ' + input.prompt?.substring(0, 50));
    try {
      // Call Gemini image generation model
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
          messages: [{
            role: 'user',
            content: 'Generate an image: ' + input.prompt
          }]
        }),
        timeout: 60000,
        json: true
      });

      // Check for inline image data in the response
      const message = r.choices?.[0]?.message;
      const content = message?.content;

      // Handle multipart content with inline images
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === 'image' && part.source?.type === 'base64') {
            // Upload base64 image to preview orchestrator
            const imageData = part.source.data;
            const mediaType = part.source.media_type || 'image/png';
            const fileName = input.fileName || 'generated-' + Date.now() + '.png';
            
            const uploadRes = await this.helpers.httpRequest({
              method: 'POST',
              url: 'https://preview-orchestrator.fly.dev/preview/write',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                siteId: siteId,
                filePath: 'public/images/' + fileName,
                content: 'data:' + mediaType + ';base64,' + imageData,
                isBase64: true,
                githubToken: githubToken
              }),
              timeout: 30000,
              ignoreHttpStatusErrors: true
            });
            
            if (uploadRes?.success) {
              await emitStep('generate_image', 'complete', 'Generated and saved: ' + fileName);
              return JSON.stringify({ imageUrl: '/images/' + fileName, success: true });
            }
            
            // Return as data URL if upload fails
            await emitStep('generate_image', 'complete', 'Generated image (inline)');
            return JSON.stringify({ imageUrl: 'data:' + mediaType + ';base64,' + imageData.slice(0, 100) + '...', inline: true });
          }
        }
      }

      // Try to extract URL from text content if present
      const textContent = typeof content === 'string' ? content : JSON.stringify(content);
      const urlPattern = /(https?:\\/\\/[^\\s"'<>]+\\.(png|jpg|jpeg|gif|webp))/i;
      const urlMatch = textContent.match(urlPattern);
      if (urlMatch) {
        await emitStep('generate_image', 'complete', 'Generated image URL');
        return JSON.stringify({ imageUrl: urlMatch[1] });
      }

      // Use a high-quality placeholder with the prompt text
      await emitStep('generate_image', 'error', 'No image in response');
      const placeholderText = encodeURIComponent(input.prompt?.substring(0, 40) || 'Generated Image');
      return JSON.stringify({
        imageUrl: 'https://placehold.co/800x600/2563eb/ffffff?text=' + placeholderText,
        fallback: true,
        debug: 'Model returned: ' + textContent.slice(0, 100)
      });
    } catch (e) {
      await emitStep('generate_image', 'error', 'Error: ' + e.message.substring(0, 50));
      return 'ERROR: ' + e.message;
    }
  }`;

    // Replace the old code with new code
    // First try to find the exact pattern
    if (code.includes("if (name === 'generate_image')")) {
        // Find and replace the generate_image block
        const startMarker = "if (name === 'generate_image')";
        const startIdx = code.indexOf(startMarker);

        if (startIdx !== -1) {
            // Find the end of this if block (matching closing brace)
            let braceCount = 0;
            let foundStart = false;
            let endIdx = startIdx;

            for (let i = startIdx; i < code.length; i++) {
                if (code[i] === '{') {
                    braceCount++;
                    foundStart = true;
                } else if (code[i] === '}') {
                    braceCount--;
                    if (foundStart && braceCount === 0) {
                        endIdx = i + 1;
                        break;
                    }
                }
            }

            const oldBlock = code.substring(startIdx, endIdx);
            console.log('Found generate_image block, length:', oldBlock.length);

            // Create escaped version of new code for JSON
            const newCodeEscaped = newImageCode
                .replace(/\\/g, '\\\\')
                .replace(/\n/g, '\\n')
                .replace(/"/g, '\\"')
                .replace(/'/g, "\\'");

            // For jsCode in n8n, we need to keep proper escaping
            code = code.substring(0, startIdx) + newImageCode + code.substring(endIdx);

            executorNode.parameters.jsCode = code;
            console.log('✅ Updated generate_image tool');
        }
    }
}

// Save
fs.writeFileSync('./FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json', JSON.stringify(workflow, null, 2));
console.log('✅ Saved updated workflow with fixed image generation');
console.log('📋 Re-import FIXED-AGENT-WORKFLOW-V51-WITH-THINKING.json into n8n');
