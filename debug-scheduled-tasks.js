require('dotenv').config();
const database = require('./src/database');

async function debugScheduledTasks() {
  try {
    console.log('🔍 DEBUGGING SCHEDULED TASKS NOT APPEARING IN MOTION\n');
    
    await database.initialize();
    
    // Check which tasks are scheduled but missing Motion IDs
    const scheduledTasks = await database.all(`
      SELECT notion_page_id, notion_name, schedule_checkbox, motion_task_id, 
             due_date, start_on, duration, priority, status,
             motion_sync_needed, motion_priority, motion_last_attempt
      FROM sync_tasks 
      WHERE schedule_checkbox = true
      ORDER BY due_date ASC
    `);
    
    console.log(`Found ${scheduledTasks.length} scheduled tasks:\n`);
    
    scheduledTasks.forEach(task => {
      const hasMotionId = !!task.motion_task_id;
      const needsSync = task.motion_sync_needed;
      const priority = task.motion_priority || 'normal';
      
      console.log(`📝 ${task.notion_name}:`);
      console.log(`   Scheduled: ${task.schedule_checkbox ? 'YES' : 'NO'}`);
      console.log(`   Motion ID: ${task.motion_task_id || 'MISSING'}`);
      console.log(`   Due Date: ${task.due_date || 'none'}`);
      console.log(`   Start On: ${task.start_on || 'none'}`);
      console.log(`   Duration: ${task.duration || 'none'} minutes`);
      console.log(`   Priority: ${task.priority || 'none'}`);
      console.log(`   Status: ${task.status}`);
      console.log(`   Needs Motion Sync: ${needsSync ? 'YES' : 'NO'}`);
      console.log(`   Motion Priority: ${priority}`);
      console.log(`   Last Attempt: ${task.motion_last_attempt || 'never'}\n`);
      
      if (!hasMotionId && !needsSync) {
        console.log(`   ⚠️  ISSUE: Scheduled but not marked for Motion sync!`);
      }
    });
    
    // Check how many are waiting for Motion sync
    const waitingForSync = scheduledTasks.filter(t => !t.motion_task_id && t.motion_sync_needed);
    console.log(`\n📊 SUMMARY:`);
    console.log(`Total scheduled tasks: ${scheduledTasks.length}`);
    console.log(`Already in Motion: ${scheduledTasks.filter(t => t.motion_task_id).length}`);
    console.log(`Waiting for Motion sync: ${waitingForSync.length}`);
    console.log(`Not queued for sync: ${scheduledTasks.filter(t => !t.motion_task_id && !t.motion_sync_needed).length}`);
    
    if (waitingForSync.length > 0) {
      console.log(`\n⏳ Tasks waiting for Motion sync:`);
      waitingForSync.forEach(task => {
        console.log(`   - ${task.notion_name} (priority: ${task.motion_priority || 'normal'})`);
      });
      
      console.log(`\n💡 These tasks should be created in Motion during the next slow sync cycle (every 3 minutes)`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

debugScheduledTasks();