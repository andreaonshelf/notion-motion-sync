require('dotenv').config();
const syncService = require('./src/services/syncService');

async function testSingleMotionTask() {
  try {
    // Try syncing the "Stress Test Assumptions" task
    const motionTaskId = 'c3cyRxyx1OSVEJf1nNk2g';
    console.log(`Syncing Motion task "${motionTaskId}" to Notion...`);
    
    await syncService.syncMotionToNotion(motionTaskId);
    console.log('Sync completed!');
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Full error:', error);
  }
}

testSingleMotionTask();