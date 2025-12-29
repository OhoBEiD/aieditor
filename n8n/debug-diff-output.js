// Add this as a Code node AFTER "Parse Plan" and BEFORE "Guardrails"
// to see what the AI is actually generating

const ctx = $input.first().json;

console.log('=== DEBUG: AI PLAN OUTPUT ===');
console.log('Intent:', ctx.plan.intent);
console.log('Human Summary:', ctx.plan.humanSummary);
console.log('File Targets:', JSON.stringify(ctx.plan.fileTargets, null, 2));
console.log('\n=== UNIFIED DIFF ===');
console.log(ctx.plan.unifiedDiff);
console.log('=== DIFF LENGTH:', ctx.plan.unifiedDiff?.length || 0, 'characters ===');
console.log('\n=== WARNINGS ===');
console.log(ctx.plan.warnings);

// Check if diff looks valid
if (!ctx.plan.unifiedDiff || ctx.plan.unifiedDiff.length < 10) {
  ctx.plan.warnings.push('⚠️ WARNING: Diff is empty or too short!');
}

if (ctx.plan.unifiedDiff && !ctx.plan.unifiedDiff.includes('---')) {
  ctx.plan.warnings.push('⚠️ WARNING: Diff missing --- header!');
}

if (ctx.plan.unifiedDiff && !ctx.plan.unifiedDiff.includes('+++')) {
  ctx.plan.warnings.push('⚠️ WARNING: Diff missing +++ header!');
}

if (ctx.plan.unifiedDiff && !ctx.plan.unifiedDiff.includes('@@')) {
  ctx.plan.warnings.push('⚠️ WARNING: Diff missing @@ hunk headers!');
}

return [{ json: ctx }];
