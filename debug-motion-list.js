require('dotenv').config();
const axios = require('axios');
const { config } = require('./src/config');

async function debugMotionList() {
  try {
    console.log('Testing Motion list tasks API directly...');
    
    const client = axios.create({
      baseURL: config.motion.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.motion.apiKey
      }
    });
    
    // Test 1: List tasks with no parameters
    console.log('\n1. No parameters:');
    try {
      const response1 = await client.get('/tasks');
      console.log(`  Status: ${response1.status}`);
      console.log(`  Tasks count: ${response1.data.tasks?.length || 0}`);
      console.log(`  Has cursor: ${!!response1.data.cursor}`);
      if (response1.data.tasks?.length > 0) {
        console.log(`  First task: ${response1.data.tasks[0].name}`);
      }
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
    
    // Test 2: List tasks with workspace ID
    console.log(`\n2. With workspaceId=${config.motion.workspaceId}:`);
    try {
      const response2 = await client.get('/tasks', { 
        params: { workspaceId: config.motion.workspaceId }
      });
      console.log(`  Status: ${response2.status}`);
      console.log(`  Tasks count: ${response2.data.tasks?.length || 0}`);
      console.log(`  Has cursor: ${!!response2.data.cursor}`);
      if (response2.data.tasks?.length > 0) {
        console.log(`  First task: ${response2.data.tasks[0].name}`);
      }
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
    
    // Test 3: List tasks with different workspace ID (maybe wrong one?)
    console.log('\n3. Without workspace filter:');
    try {
      const response3 = await client.get('/tasks', { params: {} });
      console.log(`  Status: ${response3.status}`);
      console.log(`  Tasks count: ${response3.data.tasks?.length || 0}`);
      console.log(`  Has cursor: ${!!response3.data.cursor}`);
      if (response3.data.tasks?.length > 0) {
        console.log(`  First few tasks:`);
        response3.data.tasks.slice(0, 3).forEach(task => {
          console.log(`    - ${task.name} (${task.id})`);
        });
      }
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugMotionList();