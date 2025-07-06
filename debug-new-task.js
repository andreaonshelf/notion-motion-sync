const database = require('./src/database');
const notionClient = require('./src/services/notionClient');

async function debugNewTask() {
  try {
    console.log('=== Debugging new task sync issue ===\n');
    
    // Initialize database connection
    console.log('Initializing database connection...');
    await database.init();
    console.log('Database connected\n');
    
    // 1. Check what Notion sees
    console.log('1. Fetching all tasks from Notion...');
    const notionTasks = await notionClient.queryDatabase();
    console.log(`Found ${notionTasks.length} tasks in Notion\n`);
    
    // Show last few tasks (likely to include the new one)
    console.log('Last 5 tasks from Notion:');
    const lastTasks = notionTasks.slice(-5);
    lastTasks.forEach(task => {
      console.log(`- ${task.name}: scheduled=${task.schedule}, status=${task.status}, dueDate=${task.dueDate}`);
    });
    console.log('');
    
    // 2. Check what's in the database
    console.log('2. Checking database state...');
    const dbResult = await database.pool.query(
      'SELECT notion_name, schedule_checkbox, motion_task_id, motion_sync_needed, status, updated_at FROM sync_tasks ORDER BY updated_at DESC LIMIT 10'
    );
    
    console.log('Last 10 tasks in database:');
    dbResult.rows.forEach(task => {
      console.log(`- ${task.notion_name}: scheduled=${task.schedule_checkbox}, motion_id=${task.motion_task_id || 'NULL'}, sync_needed=${task.motion_sync_needed}, updated=${task.updated_at}`);
    });
    console.log('');
    
    // 3. Check what needs Motion operations
    console.log('3. Tasks needing Motion operations:');
    const motionNeeded = await database.pool.query(
      'SELECT notion_name, schedule_checkbox, motion_task_id, motion_sync_needed, motion_priority FROM sync_tasks WHERE motion_sync_needed = true ORDER BY motion_priority, notion_name'
    );
    
    if (motionNeeded.rows.length > 0) {
      motionNeeded.rows.forEach(task => {
        console.log(`- ${task.notion_name}: scheduled=${task.schedule_checkbox}, motion_id=${task.motion_task_id || 'NULL'}, priority=${task.motion_priority}`);
      });
    } else {
      console.log('No tasks need Motion operations');
    }
    console.log('');
    
    // 4. Trigger sync detection manually
    console.log('4. Manually triggering sync detection...');
    await database.detectMotionSyncNeeds();
    
    const afterDetection = await database.pool.query(
      'SELECT notion_name, schedule_checkbox, motion_task_id, motion_sync_needed FROM sync_tasks WHERE motion_sync_needed = true ORDER BY notion_name'
    );
    
    console.log(`After detection: ${afterDetection.rows.length} tasks need Motion operations`);
    afterDetection.rows.forEach(task => {
      console.log(`- ${task.notion_name}: scheduled=${task.schedule_checkbox}, motion_id=${task.motion_task_id || 'NULL'}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

debugNewTask();