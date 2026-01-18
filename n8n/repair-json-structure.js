const fs = require('fs');

const filePath = '/Users/omarobeid/Desktop/aieditor/n8n/FIXED-AGENT-WORKFLOW-V15.json';
const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));

console.log('--- Repairing Connection Structures ---');

for (const nodeName in workflow.connections) {
    const connObj = workflow.connections[nodeName];

    // Check 'ai_tool' connections (used by Tools -> Agents)
    if (connObj.ai_tool) {
        let allDestinations = [];

        // Flatten the existing messy structure
        for (const item of connObj.ai_tool) {
            if (Array.isArray(item)) {
                allDestinations.push(...item);
            } else if (typeof item === 'object') {
                allDestinations.push(item);
            }
        }

        // Deduplicate based on node name
        const unique = [];
        const seen = new Set();
        for (const dest of allDestinations) {
            if (!seen.has(dest.node)) {
                seen.add(dest.node);
                unique.push(dest);
            }
        }

        // Reconstruct correct n8n format: [ [ dest1, dest2, dest3 ] ]
        // This represents Output 0 connecting to multiple inputs
        connObj.ai_tool = [unique];

        console.log(`Fixed ${nodeName}: ${unique.length} destinations (${unique.map(u => u.node).join(', ')})`);
    }

    // Also check 'main' connections just in case
    if (connObj.main) {
        // Main connections usually have multiple outputs [ [output0], [output1] ]
        // We should just ensure inside the inner arrays we don't have nested mess

        for (let i = 0; i < connObj.main.length; i++) {
            // If this output has mixed content, standardise it
            // But usually my scripts didn't touch 'main' except for simple pushes
            // 'main' is usually [[{node: 'NextNode'}]]
            // Let's leave main alone mostly unless we see obviously wrong structure
        }
    }

    // Check 'ai_languageModel' (Agents -> Models)
    if (connObj.ai_languageModel) {
        let allDestinations = [];
        for (const item of connObj.ai_languageModel) {
            if (Array.isArray(item)) {
                allDestinations.push(...item);
            } else if (typeof item === 'object') {
                allDestinations.push(item);
            }
        }
        const unique = [];
        const seen = new Set();
        for (const dest of allDestinations) {
            if (!seen.has(dest.node)) {
                seen.add(dest.node);
                unique.push(dest);
            }
        }
        connObj.ai_languageModel = [unique];
        console.log(`Fixed Model connection for ${nodeName} -> ${unique.map(u => u.node).join(', ')}`);
    }
}

fs.writeFileSync(filePath, JSON.stringify(workflow, null, 4));
console.log('--- JSON structure repaired ---');
