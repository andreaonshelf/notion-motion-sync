require('dotenv').config();
const syncService = require('./src/services/syncService');

async function performFullSync() {
  try {
    console.log('Starting full bidirectional sync...\n');
    
    // First sync all Motion tasks to Notion
    console.log('1. Syncing Motion tasks to Notion...');
    await syncService.syncAllMotionTasks();
    console.log('Motion->Notion sync complete!\n');
    
    // Then sync all Notion tasks to Motion
    console.log('2. Syncing Notion tasks to Motion...');
    await syncService.performFullSync();
    console.log('Notion->Motion sync complete!\n');
    
    console.log('Full bidirectional sync completed successfully!');
  } catch (error) {
    console.error('Error during full sync:', error.message);
    console.error('Stack:', error.stack);
  }
}

performFullSync();