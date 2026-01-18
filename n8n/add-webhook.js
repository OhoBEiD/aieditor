const fs = require('fs');

const filePath = '/Users/omarobeid/Desktop/aieditor/n8n/FIXED-AGENT-WORKFLOW-V15.json';
const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Add Webhook node at the beginning
const webhookNode = {
    "parameters": {
        "httpMethod": "POST",
        "path": "agent/edit-ui",
        "responseMode": "responseNode",
        "options": {
            "allowedOrigins": "*"
        }
    },
    "id": "6ee4a8e8-d92f-483e-99a8-1e86d3338350",
    "name": "Webhook Edit UI",
    "type": "n8n-nodes-base.webhook",
    "typeVersion": 2,
    "position": [41000, 4512],  // Position before Validate & Detect Intent
    "webhookId": "edit-ui"
};

// Add to nodes array at the beginning
workflow.nodes.unshift(webhookNode);

// Add connection from Webhook to Validate & Detect Intent
workflow.connections["Webhook Edit UI"] = {
    "main": [
        [
            {
                "node": "Validate & Detect Intent",
                "type": "main",
                "index": 0
            }
        ]
    ]
};

fs.writeFileSync(filePath, JSON.stringify(workflow, null, 4));
console.log('✅ Added Webhook Edit UI node and connected to Validate & Detect Intent');
