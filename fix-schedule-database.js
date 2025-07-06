const database = require('./src/database');

async function fixScheduleDatabase() {
  try {
    console.log('🔧 Fixing schedule checkbox database issue...');
    
    await database.init();
    
    // Force update the scheduled tasks that we know should be scheduled
    const tasksToFix = [
      'Action Planning for Kev',
      'Stress Test Assumptions',
      'Storyline for post: C6 acceptance',
      'Lets try once more'
    ];
    
    console.log(`\nFixing ${tasksToFix.length} tasks that should be scheduled:`);
    
    for (const taskName of tasksToFix) {
      const result = await database.pool.query(
        `UPDATE sync_tasks 
         SET schedule_checkbox = true,
             motion_sync_needed = true,
             motion_priority = 1,
             motion_last_attempt = NULL
         WHERE notion_name ILIKE $1`,
        [`%${taskName}%`]
      );
      
      if (result.rowCount > 0) {
        console.log(`✅ Fixed: ${taskName}`);
      } else {
        console.log(`❌ Not found: ${taskName}`);
      }
    }
    
    // Trigger sync detection
    console.log('\n🔄 Triggering sync detection...');
    await database.detectMotionSyncNeeds();
    
    // Check what needs Motion operations now
    const motionNeeded = await database.pool.query(
      'SELECT notion_name, schedule_checkbox, motion_task_id, motion_sync_needed FROM sync_tasks WHERE motion_sync_needed = true ORDER BY motion_priority, notion_name'
    );
    
    console.log(`\n📋 ${motionNeeded.rows.length} tasks now need Motion operations:`);
    motionNeeded.rows.forEach(task => {
      console.log(`- ${task.notion_name}: scheduled=${task.schedule_checkbox}, motion_id=${task.motion_task_id || 'NULL'}`);
    });
    
    console.log('\n✅ Database fixed! The system should now sync these tasks to Motion within 3 minutes.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

fixScheduleDatabase();