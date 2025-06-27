require('dotenv').config();
const database = require('./src/database');
const motionClient = require('./src/services/motionClient');
const logger = require('./src/utils/logger');

async function fixPeekakutcha() {
  try {
    await database.initialize();
    
    // Get Peekakutcha task
    const tasks = await database.all(`
      SELECT * FROM sync_tasks 
      WHERE notion_name ILIKE '%peekakutcha%'
    `);
    
    if (tasks.length === 0) {
      console.log('Peekakutcha not found');
      return;
    }
    
    const task = tasks[0];
    console.log(`\nFound task: ${task.notion_name} (Motion ID: ${task.motion_task_id})`);
    
    // Fetch current Motion task details
    console.log('\nFetching Motion task details...');
    try {
      const motionTask = await motionClient.getTask(task.motion_task_id);
      console.log(`Motion task status: ${motionTask.status?.name}`);
      console.log(`Scheduled start: ${motionTask.scheduledStart || 'NOT SCHEDULED'}`);
      console.log(`Scheduled end: ${motionTask.scheduledEnd || 'NOT SCHEDULED'}`);
      
      // Update Motion fields in database
      console.log('\nUpdating Motion fields in database...');
      await database.updateMotionFields(task.notion_page_id, motionTask);
      
      // Force notion_sync_needed to true
      console.log('Marking for Notion sync...');
      await database.markNotionSyncNeeded(task.notion_page_id);
      
      // Verify the update
      const updated = await database.getMappingByNotionId(task.notion_page_id);
      console.log(`\nDatabase updated:`);
      console.log(`- notion_sync_needed: ${updated.notion_sync_needed}`);
      console.log(`- motion_scheduled_start: ${updated.motion_scheduled_start || 'null'}`);
      console.log(`- motion_scheduled_end: ${updated.motion_scheduled_end || 'null'}`);
      
      console.log('\n✅ Fix applied. The next fast sync (within 60 seconds) will update Notion.');
      
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('Motion task not found - clearing phantom ID');
        await database.pool.query(
          `UPDATE sync_tasks 
           SET motion_task_id = NULL,
               motion_sync_needed = true,
               motion_priority = 1,
               notion_sync_needed = true
           WHERE notion_page_id = $1`,
          [task.notion_page_id]
        );
        console.log('✅ Phantom ID cleared, task will be recreated on next sync');
      } else {
        throw error;
      }
    }
    
    await database.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixPeekakutcha();