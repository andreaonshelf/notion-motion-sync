const axios = require('axios');
require('dotenv').config();

async function testMotionCreation() {
  const client = axios.create({
    baseURL: 'https://api.usemotion.com/v1',
    headers: {
      'X-API-Key': process.env.MOTION_API_KEY,
      'Content-Type': 'application/json'
    }
  });

  console.log('Testing Motion task creation...\n');
  console.log('Using workspace:', process.env.MOTION_WORKSPACE_ID);

  // Test 1: Basic task
  try {
    console.log('\nTest 1: Basic task (no duration/date)');
    const basic = await client.post('/tasks', {
      name: `Test Basic ${Date.now()}`,
      workspaceId: process.env.MOTION_WORKSPACE_ID
    });
    console.log('✓ Created:', basic.data.id);
    
    // Check if it exists
    const check1 = await client.get(`/tasks/${basic.data.id}`);
    console.log('✓ Verified exists');
    
    // Clean up
    await client.delete(`/tasks/${basic.data.id}`);
    console.log('✓ Cleaned up');
  } catch (e) {
    console.log('✗ Failed:', e.response?.data || e.message);
  }

  // Test 2: Task with duration
  try {
    console.log('\nTest 2: Task with duration only');
    const withDuration = await client.post('/tasks', {
      name: `Test Duration ${Date.now()}`,
      workspaceId: process.env.MOTION_WORKSPACE_ID,
      duration: 60
    });
    console.log('✓ Created:', withDuration.data.id);
    
    // Check if it exists
    const check2 = await client.get(`/tasks/${withDuration.data.id}`);
    console.log('✓ Verified exists');
    
    // Clean up
    await client.delete(`/tasks/${withDuration.data.id}`);
    console.log('✓ Cleaned up');
  } catch (e) {
    console.log('✗ Failed:', e.response?.data || e.message);
  }

  // Test 3: Task with duration AND date
  try {
    console.log('\nTest 3: Task with duration AND date');
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const withBoth = await client.post('/tasks', {
      name: `Test Both ${Date.now()}`,
      workspaceId: process.env.MOTION_WORKSPACE_ID,
      duration: 60,
      dueDate: tomorrow
    });
    console.log('✓ Created:', withBoth.data.id);
    console.log('  Response:', JSON.stringify(withBoth.data, null, 2));
    
    // Wait a bit
    console.log('  Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if it exists
    try {
      const check3 = await client.get(`/tasks/${withBoth.data.id}`);
      console.log('✓ Still exists after 2 seconds');
      console.log('  Task details:', JSON.stringify(check3.data, null, 2));
      
      // Clean up
      await client.delete(`/tasks/${withBoth.data.id}`);
      console.log('✓ Cleaned up');
    } catch (e) {
      console.log('✗ PHANTOM ID! Task disappeared:', e.response?.status);
    }
  } catch (e) {
    console.log('✗ Failed to create:', e.response?.data || e.message);
  }

  // Test 4: Different workspace
  console.log('\nTest 4: Testing with production workspace ID');
  const prodWorkspaceId = 'tDsrvyvlbBGCPP8QyMdZF';
  try {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const prodTest = await client.post('/tasks', {
      name: `Test Prod WS ${Date.now()}`,
      workspaceId: prodWorkspaceId,
      duration: 60,
      dueDate: tomorrow
    });
    console.log('✓ Created in prod workspace:', prodTest.data.id);
    
    // Check
    const check4 = await client.get(`/tasks/${prodTest.data.id}`);
    console.log('✓ Verified exists');
    
    // Clean up
    await client.delete(`/tasks/${prodTest.data.id}`);
    console.log('✓ Cleaned up');
  } catch (e) {
    console.log('✗ Failed with prod workspace:', e.response?.data || e.message);
  }
}

testMotionCreation().catch(console.error);