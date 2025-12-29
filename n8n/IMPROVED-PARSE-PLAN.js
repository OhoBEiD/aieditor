// Improved Parse Plan code for n8n
// Copy this into the Parse Plan node's JavaScript field

const ctx = $('Merge Files').item.json;
const raw = $('AI Plan').item.json;
let plan;
let out = '';

// Get the AI output text
if (raw?.output) {
  if (typeof raw.output === 'string') out = raw.output;
  else if (typeof raw.output === 'object') out = JSON.stringify(raw.output);
}
if (!out && raw?.text) out = String(raw.text);

// Collect files created via tool calls
const filesCreated = [];
const steps = raw?.intermediateSteps || [];
for (const step of steps) {
  const obs = step?.observation || step?.result || '';
  if (typeof obs === 'string' && obs.includes('Success: Created')) {
    const match = obs.match(/Created\s+(.+)/);
    if (match) filesCreated.push(match[1].trim());
  }
}

try {
  // Try to extract JSON from markdown code blocks first
  let jsonStr = '';
  
  // Pattern 1: JSON in markdown code block
  const codeBlockMatch = out.match(/```json\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    // Pattern 2: Just find JSON object containing humanSummary
    const jsonObjMatch = out.match(/\{[\s\S]*"humanSummary"[\s\S]*/);
    if (jsonObjMatch) jsonStr = jsonObjMatch[0];
  }
  
  if (jsonStr) {
    // Clean up common issues
    jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, ' ');
    
    // Try to fix truncated JSON by closing it
    if (!jsonStr.endsWith('}')) {
      // Find the last complete field and close the JSON
      const lastQuoteIdx = jsonStr.lastIndexOf('"');
      if (lastQuoteIdx > 0) {
        jsonStr = jsonStr.substring(0, lastQuoteIdx + 1) + ']}';
      }
    }
    
    // Replace trailing commas
    jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    
    try {
      plan = JSON.parse(jsonStr);
    } catch (parseErr) {
      // If parsing still fails, try to extract just humanSummary
      const summaryMatch = jsonStr.match(/"humanSummary"\s*:\s*"([^"]+)"/);
      if (summaryMatch || filesCreated.length > 0) {
        plan = {
          humanSummary: summaryMatch ? summaryMatch[1] : `Created ${filesCreated.length} file(s): ${filesCreated.join(', ')}`,
          unifiedDiff: '',
          fileTargets: filesCreated.map(f => ({ path: f, action: 'create' })),
          warnings: ['JSON was truncated but files were created successfully']
        };
      } else {
        throw parseErr;
      }
    }
  } else if (filesCreated.length > 0) {
    // No JSON found but files were created via tools
    plan = {
      humanSummary: `Created ${filesCreated.length} file(s): ${filesCreated.join(', ')}. Refresh to see changes!`,
      unifiedDiff: '',
      fileTargets: filesCreated.map(f => ({ path: f, action: 'create' })),
      warnings: []
    };
  } else {
    plan = {
      humanSummary: 'Please try again with a more specific request.',
      unifiedDiff: '',
      fileTargets: [],
      warnings: []
    };
  }
} catch (e) {
  // On any error, check if files were created and report success
  if (filesCreated.length > 0) {
    plan = {
      humanSummary: `Created ${filesCreated.length} file(s): ${filesCreated.join(', ')}. Refresh to see changes!`,
      unifiedDiff: '',
      fileTargets: filesCreated.map(f => ({ path: f, action: 'create' })),
      warnings: []
    };
  } else {
    plan = {
      humanSummary: 'Error parsing AI response.',
      unifiedDiff: '',
      fileTargets: [],
      warnings: [`Parse error: ${e.message} | Output: ${out.substring(0, 200)}`]
    };
  }
}

// Ensure all fields have correct types
plan.warnings = Array.isArray(plan.warnings) ? plan.warnings : [];
plan.unifiedDiff = typeof plan.unifiedDiff === 'string' ? plan.unifiedDiff : '';
plan.fileTargets = Array.isArray(plan.fileTargets) ? plan.fileTargets : [];
plan.humanSummary = plan.humanSummary || 'Changes processed.';

return [{ json: { ...ctx, plan, filesCreated } }];
