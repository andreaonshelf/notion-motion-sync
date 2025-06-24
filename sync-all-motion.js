require('dotenv').config();
const syncService = require('./src/services/syncService');

async function syncAllMotion() {
  try {
    console.log('Starting Motion->Notion sync for all tasks...\n');
    await syncService.syncAllMotionTasks();
    console.log('\nMotion->Notion sync completed!');
  } catch (error) {
    console.error('Error during sync:', error.message);
  }
}

syncAllMotion();