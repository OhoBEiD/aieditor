// Fixed Parse Plan node - works with AI Agent
const ctx = $('Merge Files').item.json;
const agentOutput = $('AI Plan Agent').item.json; // Changed from 'AI Plan' to 'AI Plan Agent'

// Agent returns output in different format than basic LLM
let plan;
let out = '';

// Try to get output from agent
if (agentOutput.output) {
  out = String(agentOutput.output);
} else if (agentOutput.text) {
  out = String(agentOutput.text);
} else if (agentOutput.response) {
  out = String(agentOutput.response);
} else {
  out = JSON.stringify(agentOutput);
}

// Try to parse JSON from output
try {
  // Try direct parse first
  if (typeof agentOutput.output === 'object' && agentOutput.output !== null) {
    plan = agentOutput.output;
  } else {
    // Extract JSON from text
    const jsonMatch = out.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      plan = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in output');
    }
  }
} catch (e) {
  // Fallback plan if parsing fails
  plan = {
    intent: 'error',
    humanSummary: 'Failed to parse AI agent output: ' + e.message,
    unifiedDiff: '',
    fileTargets: [],
    warnings: ['Could not parse agent response', 'Raw output: ' + out.slice(0, 200)]
  };
}

// Ensure required fields exist
plan.warnings = plan.warnings || [];
plan.unifiedDiff = plan.unifiedDiff || '';
plan.humanSummary = plan.humanSummary || '';
plan.fileTargets = plan.fileTargets || [];
plan.packagesToInstall = plan.packagesToInstall || [];

return [{ json: { ...ctx, plan } }];
