require('dotenv').config();
const database = require('./src/database');

async function forceCompletedStatus() {
  try {
    console.log('🔄 FORCING COMPLETED STATUS UPDATE\n');
    
    await database.initialize();
    
    // Force update the status and sync flag for completed tasks
    const result = await database.run(`
      UPDATE sync_tasks 
      SET status = 'Done', 
          notion_sync_needed = true
      WHERE motion_task_id IN ('0UQJffymRYc-pud5jMQ-W', 'os-w3RCjXb7_mP3jc19JP')
      AND motion_completed = true
    `);
    
    console.log(`✅ Updated ${result.changes} tasks to 'Done' status`);
    
    // Verify the update
    const updatedTasks = await database.all(`
      SELECT notion_name, status, notion_sync_needed, motion_completed
      FROM sync_tasks 
      WHERE motion_task_id IN ('0UQJffymRYc-pud5jMQ-W', 'os-w3RCjXb7_mP3jc19JP')
    `);
    
    console.log('\nUpdated task status:');
    updatedTasks.forEach(task => {
      console.log(`📝 ${task.notion_name}: status=${task.status}, sync_needed=${task.notion_sync_needed}, completed=${task.motion_completed}`);
    });
    
    console.log('\n🔄 Now trigger the fast sync to push to Notion...');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

forceCompletedStatus();