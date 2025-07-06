require('dotenv').config();
const database = require('./src/database');

async function debugDatabaseToNotion() {
  try {
    console.log('🔍 CHECKING DATABASE STATUS FOR COMPLETED TASKS\n');
    
    await database.initialize();
    
    // Check the database status of our completed tasks
    const completedInDatabase = await database.all(`
      SELECT notion_page_id, notion_name, status, motion_completed, motion_completed_time, notion_sync_needed
      FROM sync_tasks 
      WHERE motion_task_id IN ('0UQJffymRYc-pud5jMQ-W', 'os-w3RCjXb7_mP3jc19JP')
    `);
    
    console.log('Database status for completed tasks:');
    completedInDatabase.forEach(task => {
      console.log(`\n📝 ${task.notion_name}:`);
      console.log(`   Status: ${task.status}`);
      console.log(`   Motion Completed: ${task.motion_completed}`);
      console.log(`   Completed Time: ${task.motion_completed_time}`);
      console.log(`   Notion Sync Needed: ${task.notion_sync_needed}`);
    });
    
    // Check all tasks that need Notion sync
    const needsSync = await database.all(`
      SELECT notion_page_id, notion_name, status, notion_sync_needed, motion_completed
      FROM sync_tasks 
      WHERE notion_sync_needed = true
    `);
    
    console.log(`\n📋 Tasks needing Notion sync: ${needsSync.length}`);
    needsSync.forEach(task => {
      console.log(`- ${task.notion_name}: status=${task.status}, completed=${task.motion_completed}`);
    });
    
    if (needsSync.length > 0) {
      console.log('\n🔄 These tasks should sync to Notion on next fast sync cycle...');
    } else {
      console.log('\n⚠️  No tasks marked for Notion sync - this might be the issue');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

debugDatabaseToNotion();