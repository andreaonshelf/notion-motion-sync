require('dotenv').config();
const database = require('./src/database');
const motionClient = require('./src/services/motionClient');
const logger = require('./src/utils/logger');

async function checkMotionFields() {
  try {
    // Initialize database first
    await database.initialize();
    
    console.log('\n=== CHECKING MOTION FIELDS IN DATABASE ===\n');
    
    // Get all tasks with Motion IDs
    const tasksWithMotion = await database.all(`
      SELECT 
        notion_page_id,
        notion_name,
        motion_task_id,
        motion_start_on,
        motion_scheduled_start,
        motion_scheduled_end,
        motion_status_name,
        motion_scheduling_issue,
        motion_completed,
        motion_deadline_type,
        motion_updated_time,
        notion_sync_needed,
        schedule_checkbox
      FROM sync_tasks 
      WHERE motion_task_id IS NOT NULL
      ORDER BY notion_name
      LIMIT 10
    `);
    
    console.log(`Found ${tasksWithMotion.length} tasks with Motion IDs\n`);
    
    // Count tasks with scheduling data
    const tasksWithScheduling = tasksWithMotion.filter(t => 
      t.motion_scheduled_start || t.motion_scheduled_end
    );
    
    console.log(`Tasks with scheduling data: ${tasksWithScheduling.length}\n`);
    
    // Show details for each task
    for (const task of tasksWithMotion) {
      console.log(`Task: ${task.notion_name}`);
      console.log(`  Motion ID: ${task.motion_task_id}`);
      console.log(`  Schedule checkbox: ${task.schedule_checkbox}`);
      console.log(`  Motion fields:`);
      console.log(`    - scheduledStart: ${task.motion_scheduled_start || 'null'}`);
      console.log(`    - scheduledEnd: ${task.motion_scheduled_end || 'null'}`);
      console.log(`    - startOn: ${task.motion_start_on || 'null'}`);
      console.log(`    - status: ${task.motion_status_name || 'null'}`);
      console.log(`    - completed: ${task.motion_completed}`);
      console.log(`    - schedulingIssue: ${task.motion_scheduling_issue}`);
      console.log(`    - deadlineType: ${task.motion_deadline_type || 'null'}`);
      console.log(`    - updatedTime: ${task.motion_updated_time || 'null'}`);
      console.log(`  Notion sync needed: ${task.notion_sync_needed}`);
      console.log('');
    }
    
    // Check one task directly from Motion API
    if (tasksWithMotion.length > 0) {
      const testTaskId = 'I8Y8VH3zQIyIkCgiWKW8k'; // The scheduled task we found
      console.log(`\n=== COMPARING WITH MOTION API (${testTaskId}) ===\n`);
      
      try {
        const motionTask = await motionClient.getTask(testTaskId);
        console.log('Motion API Response:');
        console.log(`  scheduledStart: ${motionTask.scheduledStart}`);
        console.log(`  scheduledEnd: ${motionTask.scheduledEnd}`);
        console.log(`  duration: ${motionTask.duration}`);
        console.log(`  dueDate: ${motionTask.dueDate}`);
        console.log(`  status: ${motionTask.status?.name}`);
        console.log(`  completed: ${motionTask.completed}`);
        console.log(`  schedulingIssue: ${motionTask.schedulingIssue}`);
        console.log(`  deadlineType: ${motionTask.deadlineType}`);
        console.log(`  updatedTime: ${motionTask.updatedTime}`);
        
        // Check if this task is in our database
        const dbTask = await database.get(
          'SELECT * FROM sync_tasks WHERE motion_task_id = $1',
          [testTaskId]
        );
        
        if (dbTask) {
          console.log(`\nDatabase record for this task:`);
          console.log(`  motion_scheduled_start: ${dbTask.motion_scheduled_start || 'null'}`);
          console.log(`  motion_scheduled_end: ${dbTask.motion_scheduled_end || 'null'}`);
        } else {
          console.log(`\nThis task is NOT in the database yet`);
        }
        
      } catch (error) {
        console.error(`Error fetching Motion task: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('Error checking Motion fields:', error);
  } finally {
    process.exit(0);
  }
}

checkMotionFields();