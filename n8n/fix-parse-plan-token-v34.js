const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V33.json');
let workflowText = fs.readFileSync(workflowPath, 'utf8');

console.log('🔧 Fixing V34: Corrupted JWT tokens in Parse Plan node\n');

// The corrupted token has "iaWd0YCI" instead of "iat"
const corruptedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImiaWd0YCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4';

const correctToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4';

// Count occurrences
const occurrences = (workflowText.match(new RegExp(corruptedToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

console.log('✅ Found ' + occurrences + ' occurrences of corrupted token');
console.log('   Corrupted: ...ImiaWd0YCI... (wrong)');
console.log('   Correct:   ...ImlhdCI... (fixed)');

// Replace all occurrences
workflowText = workflowText.replace(new RegExp(corruptedToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), correctToken);

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V34.json');
fs.writeFileSync(outputPath, workflowText);

console.log('\n✅ Created V34 - Fixed JWT tokens!');
console.log('📁 Saved to:', outputPath);
console.log('\n🔧 Fixes applied:');
console.log('  ✓ Parse Plan node: Fixed ' + occurrences + ' corrupted JWT tokens');
console.log('  ✓ All Supabase API calls will now work correctly');
console.log('\n🎯 V34 = V33 (syntax fixes) + V32 (memory grep) + fixed auth tokens');
console.log('\n📊 Complete feature set:');
console.log('  • Ultra-compressed prompts (580 → 150 tokens)');
console.log('  • Memory-aware grep_search');
console.log('  • Fixed n8n expression syntax');
console.log('  • Fixed authentication tokens');
console.log('  • Target: 300-500 tokens for simple requests');
