require('dotenv').config();
const axios = require('axios');
const { config } = require('./src/config');

async function testMotionDependencies() {
  try {
    console.log('Testing Motion API for dependency/blocking support...');
    
    const client = axios.create({
      baseURL: config.motion.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.motion.apiKey
      }
    });
    
    // Test 1: Try to create a task with dependency fields
    console.log('\n=== Testing task creation with potential dependency fields ===');
    
    const testPayload = {
      name: 'Test Dependency Task (DELETE ME)',
      workspaceId: config.motion.workspaceId,
      // Try common dependency field names
      dependencies: [],
      blockedBy: [],
      blocking: [],
      dependsOn: [],
      prerequisites: []
    };
    
    try {
      const response = await client.post('/tasks', testPayload);
      console.log('✅ Task created successfully with dependency fields');
      console.log('Response includes dependency data:', 
        Object.keys(response.data).filter(k => 
          k.toLowerCase().includes('depend') || 
          k.toLowerCase().includes('block')
        )
      );
      
      // Clean up - delete the test task
      try {
        await client.delete(`/tasks/${response.data.id}`);
        console.log('✅ Test task cleaned up');
      } catch (cleanupError) {
        console.log('⚠️  Test task cleanup failed, please delete manually:', response.data.id);
      }
      
    } catch (error) {
      console.log('❌ Task creation failed:', error.response?.data || error.message);
      
      // If certain fields caused issues, we'll know
      if (error.response?.data) {
        console.log('Error details:', JSON.stringify(error.response.data, null, 2));
      }
    }
    
    // Test 2: Check if Motion has a separate dependencies endpoint
    console.log('\n=== Testing for dependency endpoints ===');
    
    const potentialEndpoints = [
      '/dependencies',
      '/task-dependencies', 
      '/relationships',
      '/task-relationships'
    ];
    
    for (const endpoint of potentialEndpoints) {
      try {
        const response = await client.get(endpoint);
        console.log(`✅ Found endpoint: ${endpoint}`);
        console.log('Response structure:', Object.keys(response.data));
      } catch (error) {
        console.log(`❌ ${endpoint}: ${error.response?.status || error.message}`);
      }
    }
    
    // Test 3: Check Motion's OpenAPI/documentation endpoint
    console.log('\n=== Checking for API documentation endpoints ===');
    
    const docEndpoints = [
      '/openapi.json',
      '/swagger.json',
      '/docs',
      '/api-docs'
    ];
    
    for (const endpoint of docEndpoints) {
      try {
        const response = await client.get(endpoint);
        console.log(`✅ Found docs at: ${endpoint}`);
      } catch (error) {
        console.log(`❌ ${endpoint}: ${error.response?.status || 'not found'}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testMotionDependencies();