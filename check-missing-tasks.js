require('dotenv').config();
const database = require('./src/database');

async function checkMissingTasks() {
  try {
    await database.initialize();
    
    // Get scheduled tasks without Motion IDs
    const missingTasks = await database.all(`
      SELECT notion_page_id, notion_name, schedule_checkbox, motion_task_id, 
             motion_sync_needed, motion_priority, motion_last_attempt,
             due_date, duration, priority
      FROM sync_tasks 
      WHERE schedule_checkbox = true 
      AND motion_task_id IS NULL
      ORDER BY due_date ASC
    `);
    
    console.log(`Found ${missingTasks.length} scheduled tasks without Motion IDs:`);
    
    missingTasks.forEach(task => {
      console.log(`\n📝 ${task.notion_name}:`);
      console.log(`   Due: ${task.due_date}`);
      console.log(`   Duration: ${task.duration} min`);
      console.log(`   Priority: ${task.priority}`);
      console.log(`   Needs Motion Sync: ${task.motion_sync_needed ? 'YES' : 'NO'}`);
      console.log(`   Motion Priority: ${task.motion_priority || 'none'}`);
      console.log(`   Last Attempt: ${task.motion_last_attempt || 'never'}`);
    });
    
    // Check if slow sync is even trying to process them
    const needsSync = await database.all(`
      SELECT COUNT(*) as count 
      FROM sync_tasks 
      WHERE motion_sync_needed = true
    `);
    
    console.log(`\nTasks marked for Motion sync: ${needsSync[0].count}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkMissingTasks();