const database = require('./src/database');

async function checkStressTest() {
  try {
    console.log('=== Checking Stress Test Assumptions in database ===\n');
    
    // Check specific task
    const stressResult = await database.pool.query(
      "SELECT * FROM sync_tasks WHERE notion_name ILIKE '%stress%'",
      []
    );
    
    console.log('Tasks with "stress" in name:');
    if (stressResult.rows.length > 0) {
      stressResult.rows.forEach(task => {
        console.log('- Name:', task.notion_name);
        console.log('- Schedule checkbox:', task.schedule_checkbox);
        console.log('- Motion Task ID:', task.motion_task_id);
        console.log('- Motion sync needed:', task.motion_sync_needed);
        console.log('- Status:', task.status);
        console.log('- Due date:', task.due_date);
        console.log('- Priority:', task.motion_priority);
        console.log('- Last attempt:', task.motion_last_attempt);
        console.log('---');
      });
    } else {
      console.log('No tasks found with "stress" in name');
    }
    
    // Check all scheduled tasks
    console.log('\n=== All scheduled tasks (schedule_checkbox = true) ===\n');
    const scheduled = await database.pool.query(
      'SELECT notion_name, schedule_checkbox, motion_task_id, motion_sync_needed, motion_priority FROM sync_tasks WHERE schedule_checkbox = true ORDER BY notion_name',
      []
    );
    
    scheduled.rows.forEach(task => {
      console.log(`${task.notion_name}: motion_id=${task.motion_task_id || 'NULL'}, sync_needed=${task.motion_sync_needed}, priority=${task.motion_priority}`);
    });
    
    // Check tasks that need Motion operations
    console.log('\n=== Tasks needing Motion operations ===\n');
    const needsMotion = await database.pool.query(
      'SELECT notion_name, schedule_checkbox, motion_task_id, motion_sync_needed, motion_priority FROM sync_tasks WHERE motion_sync_needed = true ORDER BY motion_priority, notion_name',
      []
    );
    
    needsMotion.rows.forEach(task => {
      console.log(`${task.notion_name}: scheduled=${task.schedule_checkbox}, motion_id=${task.motion_task_id || 'NULL'}, priority=${task.motion_priority}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkStressTest();