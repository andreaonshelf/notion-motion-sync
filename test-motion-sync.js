require('dotenv').config();
const syncService = require('./src/services/syncService');
const motionClient = require('./src/services/motionClient');

async function testMotionSync() {
  try {
    console.log('Fetching Motion tasks...');
    const response = await motionClient.listTasks();
    console.log(`Found ${response.tasks.length} Motion tasks`);
    
    // Try syncing just the first one
    if (response.tasks.length > 0) {
      const firstTask = response.tasks[0];
      console.log(`\nTrying to sync first task: "${firstTask.name}"`);
      console.log('Task ID:', firstTask.id);
      console.log('Status:', firstTask.status);
      
      await syncService.syncMotionToNotion(firstTask.id);
      console.log('Sync completed!');
    }
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testMotionSync();