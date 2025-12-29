// Test if the Fly Apply Diff endpoint is working
async function testApplyDiff() {
  const testDiff = `--- a/src/app/page.tsx
+++ b/src/app/page.tsx
@@ -10,7 +10,7 @@
-        <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Demo Site</h1>
+        <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Obeid Store</h1>
`;

  try {
    const response = await fetch('https://preview-orchestrator.fly.dev/preview/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: '00000000-0000-0000-0000-000000000001',
        unifiedDiff: testDiff
      })
    });

    const data = await response.json();
    console.log('Response:', data);

    if (data.ok) {
      console.log('✅ Apply succeeded!');
      console.log('Files changed:', data.filesChanged);
    } else {
      console.log('❌ Apply failed:', data.error);
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

testApplyDiff();
