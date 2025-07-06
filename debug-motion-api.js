require('dotenv').config();
const motionClient = require('./src/services/motionClient');

async function debugMotionAPI() {
  try {
    console.log('Testing Motion API connectivity...');
    
    // Test different queries
    console.log('\n1. List tasks with default parameters:');
    const defaultResult = await motionClient.listTasks();
    console.log(`  Found ${defaultResult.tasks.length} tasks`);
    
    console.log('\n2. List tasks without workspace filter:');
    const noWorkspaceResult = await motionClient.listTasks({});
    console.log(`  Found ${noWorkspaceResult.tasks.length} tasks`);
    
    // Try to get a specific known task
    console.log('\n3. Try to get a specific task we know exists:');
    const knownTaskIds = [
      'tVKI89CsxWDmwW3GkQTgB', // AI Forge GTM plan
      '0UQJffymRYc-pud5jMQ-W', // Pecha Kutcha
      'os-w3RCjXb7_mP3jc19JP'  // New Version of Pitch Deck
    ];
    
    for (const taskId of knownTaskIds) {
      try {
        const task = await motionClient.getTask(taskId);
        console.log(`  ✅ Task ${taskId}: ${task.name}`);
        console.log(`     schedulingIssue: ${task.schedulingIssue}`);
        console.log(`     scheduledStart: ${task.scheduledStart}`);
        console.log(`     scheduledEnd: ${task.scheduledEnd}`);
      } catch (error) {
        console.log(`  ❌ Task ${taskId}: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
  }
}

debugMotionAPI();