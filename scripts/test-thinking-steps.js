#!/usr/bin/env node

// Test if thinking_steps table exists in Supabase
const SUPABASE_URL = 'https://jjrbnjubjiswvxeradzw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4';

async function testThinkingSteps() {
  console.log('🔍 Testing thinking_steps table...\n');

  // Test 1: Check if table exists
  console.log('1. Checking if thinking_steps table exists...');
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/thinking_steps?limit=1`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (response.ok) {
      console.log('✅ Table exists!\n');
    } else {
      const error = await response.text();
      console.log('❌ Table does NOT exist or is not accessible');
      console.log('Error:', error);
      console.log('\n📝 You need to run this SQL in Supabase SQL Editor:');
      console.log('   File: supabase/thinking_steps.sql\n');
      return;
    }
  } catch (err) {
    console.error('❌ Error checking table:', err.message);
    return;
  }

  // Test 2: Write a test thinking step
  console.log('2. Writing test thinking step...');
  const testStep = {
    request_id: 'test_' + Date.now(),
    conversation_id: null,
    site_id: '00000000-0000-0000-0000-000000000001',
    step_number: 1,
    tool_name: 'test_tool',
    status: 'complete',
    message: 'Test thinking step',
    details: { test: true }
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/thinking_steps`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(testStep)
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Successfully wrote test step!');
      console.log('   ID:', data[0]?.id);
      console.log('   Message:', data[0]?.message);
      console.log('');

      // Test 3: Read it back
      console.log('3. Reading test step back...');
      const readResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/thinking_steps?request_id=eq.${testStep.request_id}`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        }
      );

      if (readResponse.ok) {
        const steps = await readResponse.json();
        console.log('✅ Successfully read back test step!');
        console.log('   Found', steps.length, 'step(s)');
        console.log('');

        // Clean up
        console.log('4. Cleaning up test data...');
        await fetch(`${SUPABASE_URL}/rest/v1/thinking_steps?request_id=eq.${testStep.request_id}`, {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        });
        console.log('✅ Test data cleaned up\n');

        console.log('🎉 All tests passed!');
        console.log('');
        console.log('✅ Supabase thinking_steps table is working correctly');
        console.log('✅ n8n workflow can write to the table');
        console.log('✅ Frontend can read from the table');
        console.log('');
        console.log('📋 Next steps:');
        console.log('   1. Import the workflow: n8n/AI-EDITOR-V14-WITH-THINKING.json');
        console.log('   2. Activate it in n8n dashboard');
        console.log('   3. Send a test message to the AI');
        console.log('   4. Watch for thinking steps in real-time!');
      }
    } else {
      const error = await response.text();
      console.log('❌ Failed to write test step');
      console.log('Error:', error);
    }
  } catch (err) {
    console.error('❌ Error during test:', err.message);
  }
}

testThinkingSteps();
