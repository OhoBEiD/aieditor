const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V16.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Adding SSE streaming for thinking steps...\n');

// Find the "Webhook Edit UI" node to add SSE webhook after it
const webhookNode = workflow.nodes.find(n => n.name === 'Webhook Edit UI');

if (!webhookNode) {
  console.error('❌ Could not find Webhook Edit UI node');
  process.exit(1);
}

// Add SSE Webhook for streaming thinking steps
const sseWebhookNode = {
  "parameters": {
    "httpMethod": "GET",
    "path": "agent/thinking-steps/:requestId",
    "responseMode": "responseNode",
    "options": {
      "allowedOrigins": "*"
    }
  },
  "id": "sse-webhook-001",
  "name": "SSE Thinking Steps",
  "type": "n8n-nodes-base.webhook",
  "typeVersion": 2,
  "position": [
    27168,
    8976
  ],
  "webhookId": "sse-thinking-steps"
};

// Add SSE response node
const sseStreamNode = {
  "parameters": {
    "jsCode": `// Stream thinking steps via Server-Sent Events
const requestId = $json.params.requestId;

if (!requestId) {
  return [{ json: { error: 'Request ID required' } }];
}

// Set SSE headers
const headers = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Access-Control-Allow-Origin': '*'
};

// Fetch thinking steps from Supabase
async function streamSteps() {
  let lastStepNumber = 0;
  const maxDuration = 120000; // 2 minutes max
  const startTime = Date.now();

  while (Date.now() - startTime < maxDuration) {
    try {
      const response = await this.helpers.httpRequest({
        method: 'GET',
        url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps?request_id=eq.' + requestId + '&order=step_number.asc',
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4'
        },
        timeout: 5000
      });

      if (Array.isArray(response)) {
        const newSteps = response.filter(s => s.step_number > lastStepNumber);

        for (const step of newSteps) {
          // Send SSE event
          const data = JSON.stringify({
            step_number: step.step_number,
            tool_name: step.tool_name,
            status: step.status,
            message: step.message,
            details: step.details
          });

          console.log('data: ' + data + '\\n\\n');
          lastStepNumber = step.step_number;

          // Check if this is the completion step
          if (step.tool_name === 'complete' || step.step_number === 999999) {
            console.log('event: complete\\ndata: ' + data + '\\n\\n');
            return;
          }
        }
      }
    } catch (e) {
      console.error('Error fetching steps:', e.message);
    }

    // Wait 500ms before next poll
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

return [{ json: { requestId, streaming: true } }];`
  },
  "id": "sse-stream-001",
  "name": "Stream Steps",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [
    27360,
    8976
  ]
};

// Add SSE response node
const sseResponseNode = {
  "parameters": {
    "respondWith": "text",
    "responseBody": "={{ $json.stream }}",
    "options": {
      "responseHeaders": {
        "entries": [
          {
            "name": "Content-Type",
            "value": "text/event-stream"
          },
          {
            "name": "Cache-Control",
            "value": "no-cache"
          },
          {
            "name": "Connection",
            "value": "keep-alive"
          },
          {
            "name": "Access-Control-Allow-Origin",
            "value": "*"
          }
        ]
      }
    }
  },
  "id": "sse-response-001",
  "name": "SSE Response",
  "type": "n8n-nodes-base.respondToWebhook",
  "typeVersion": 1.1,
  "position": [
    27568,
    8976
  ]
};

// Add nodes to workflow
workflow.nodes.push(sseWebhookNode, sseStreamNode, sseResponseNode);

// Add connections
workflow.connections["SSE Thinking Steps"] = {
  "main": [[{ "node": "Stream Steps", "type": "main", "index": 0 }]]
};

workflow.connections["Stream Steps"] = {
  "main": [[{ "node": "SSE Response", "type": "main", "index": 0 }]]
};

console.log('✅ Added SSE webhook endpoint');
console.log('✅ Added streaming logic');
console.log('✅ Added SSE response handler');

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V17-SSE.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\\n📁 Saved to:', outputPath);
console.log('\\n📋 Next steps:');
console.log('  1. Import V17 into n8n');
console.log('  2. Update frontend to connect to SSE endpoint:');
console.log('     GET /agent/thinking-steps/{requestId}');
console.log('  3. Frontend should use EventSource API to receive real-time updates');
console.log('\\n💡 Frontend example:');
console.log(`
const eventSource = new EventSource(\`https://n8n-ai-editor.fly.dev/webhook/agent/thinking-steps/\${requestId}\`);

eventSource.onmessage = (event) => {
  const step = JSON.parse(event.data);
  console.log('Step:', step.message);
  // Update UI with step.message, step.tool_name, step.status
};

eventSource.addEventListener('complete', () => {
  eventSource.close();
  console.log('Agent finished!');
});
`);
