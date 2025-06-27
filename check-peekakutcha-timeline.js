require('dotenv').config();
const database = require('./src/database');

async function checkTimeline() {
  try {
    await database.initialize();
    
    // Check when notion_sync_needed was last set to false
    const result = await database.all(`
      SELECT 
        notion_page_id,
        notion_name,
        motion_task_id,
        notion_sync_needed,
        motion_sync_needed,
        motion_last_attempt,
        motion_scheduled_start,
        motion_scheduled_end,
        updated_at,
        sync_status
      FROM sync_tasks 
      WHERE notion_name ILIKE '%peekakutcha%'
    `);
    
    if (result.length > 0) {
      const task = result[0];
      console.log('\n=== PEEKAKUTCHA CURRENT STATE ===');
      console.log(`Name: ${task.notion_name}`);
      console.log(`Motion ID: ${task.motion_task_id}`);
      console.log(`Notion sync needed: ${task.notion_sync_needed}`);
      console.log(`Motion sync needed: ${task.motion_sync_needed}`);
      console.log(`Motion last attempt: ${task.motion_last_attempt}`);
      console.log(`Motion scheduled start: ${task.motion_scheduled_start}`);
      console.log(`Motion scheduled end: ${task.motion_scheduled_end}`);
      console.log(`Last updated: ${task.updated_at}`);
      console.log(`Sync status: ${task.sync_status}`);
      
      // Let's check if we can fetch the Motion task details
      console.log('\n=== FETCHING MOTION TASK DETAILS ===');
      const motionClient = require('./src/services/motionClient');
      try {
        const motionTask = await motionClient.getTask(task.motion_task_id);
        console.log('Motion task found!');
        console.log(`scheduledStart: ${motionTask.scheduledStart}`);
        console.log(`scheduledEnd: ${motionTask.scheduledEnd}`);
        console.log(`status: ${motionTask.status?.name}`);
        console.log(`completed: ${motionTask.completed}`);
        
        // Check if we need to update the database
        if (motionTask.scheduledStart && !task.motion_scheduled_start) {
          console.log('\n!!! Motion fields are missing in database but exist in Motion API !!!');
          console.log('This explains why the sync failed - the Motion fields were never stored.');
        }
      } catch (error) {
        console.log(`Error fetching Motion task: ${error.message}`);
        if (error.response?.status === 404) {
          console.log('Motion task not found - this is a phantom ID!');
        }
      }
    }
    
    await database.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTimeline();