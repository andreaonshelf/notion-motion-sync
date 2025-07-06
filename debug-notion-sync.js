require('dotenv').config();
const database = require('./src/database');
const pollService = require('./src/services/pollService');

async function debugNotionSync() {
  try {
    console.log('🔍 DEBUGGING NOTION SYNC PROCESS\n');
    
    await database.initialize();
    
    // Check what tasks need Notion sync
    const tasksToUpdate = await database.getNotionTasksToUpdate(20);
    
    console.log(`Found ${tasksToUpdate.length} tasks needing Notion sync:`);
    tasksToUpdate.forEach(task => {
      console.log(`\n📝 ${task.notion_name}:`);
      console.log(`   Status: ${task.status}`);
      console.log(`   Motion Completed: ${task.motion_completed}`);
      console.log(`   Motion Task ID: ${task.motion_task_id}`);
      console.log(`   Notion Sync Needed: ${task.notion_sync_needed}`);
    });
    
    if (tasksToUpdate.length > 0) {
      console.log('\n🔄 Running Database → Notion sync...');
      await pollService.syncDatabaseToNotion();
      console.log('✅ Sync completed');
    } else {
      console.log('\n⚠️  No tasks found that need Notion sync');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    process.exit(0);
  }
}

debugNotionSync();