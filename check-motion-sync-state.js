const database = require('./src/database');
const logger = require('./src/utils/logger');

async function checkMotionSyncState() {
  try {
    await database.initialize();
    
    console.log('\n=== Motion Sync State Analysis ===\n');
    
    // 1. Check tasks with motion_sync_needed = true
    const needingSyncQuery = `
      SELECT 
        notion_page_id,
        notion_name,
        motion_task_id,
        motion_sync_needed,
        motion_last_attempt,
        motion_priority,
        sync_status,
        error_message,
        schedule_checkbox,
        notion_duration,
        notion_due_date
      FROM sync_tasks 
      WHERE motion_sync_needed = true
      ORDER BY motion_priority ASC, notion_last_edited DESC
    `;
    
    const needingSync = await database.all(needingSyncQuery);
    console.log(`Tasks with motion_sync_needed = true: ${needingSync.length}`);
    
    if (needingSync.length > 0) {
      console.log('\nFirst 5 tasks needing Motion sync:');
      needingSync.slice(0, 5).forEach(task => {
        console.log(`- ${task.notion_name || 'Unnamed'}`);
        console.log(`  Motion ID: ${task.motion_task_id || 'None'}`);
        console.log(`  Last Attempt: ${task.motion_last_attempt || 'Never'}`);
        console.log(`  Priority: ${task.motion_priority}`);
        console.log(`  Status: ${task.sync_status}`);
        console.log(`  Scheduled: ${task.schedule_checkbox}`);
      });
    }
    
    // 2. Check tasks that should be picked up by getMotionTasksToProcess
    const processableQuery = `
      SELECT * FROM sync_tasks 
      WHERE motion_sync_needed = true
        AND (motion_last_attempt IS NULL OR motion_last_attempt < NOW() - INTERVAL '2 minutes')
      ORDER BY 
        motion_priority ASC,
        motion_last_attempt ASC NULLS FIRST,
        updated_at ASC
      LIMIT 5
    `;
    
    const processable = await database.all(processableQuery);
    console.log(`\nTasks ready for processing (no recent attempts): ${processable.length}`);
    
    // 3. Check tasks blocked by recent attempts
    const blockedQuery = `
      SELECT 
        notion_name,
        motion_last_attempt,
        EXTRACT(EPOCH FROM (NOW() - motion_last_attempt))/60 as minutes_ago
      FROM sync_tasks 
      WHERE motion_sync_needed = true
        AND motion_last_attempt IS NOT NULL 
        AND motion_last_attempt >= NOW() - INTERVAL '2 minutes'
      ORDER BY motion_last_attempt DESC
    `;
    
    const blocked = await database.all(blockedQuery);
    console.log(`\nTasks blocked by recent attempts: ${blocked.length}`);
    
    if (blocked.length > 0) {
      console.log('Recently attempted tasks:');
      blocked.forEach(task => {
        console.log(`- ${task.notion_name}: attempted ${Math.round(task.minutes_ago)} minutes ago`);
      });
    }
    
    // 4. Check phantom IDs (404 errors)
    const phantomQuery = `
      SELECT 
        notion_name,
        motion_task_id,
        error_message,
        error_count
      FROM sync_tasks 
      WHERE motion_task_id IS NOT NULL
        AND sync_status = 'error'
        AND error_message LIKE '%404%'
    `;
    
    const phantoms = await database.all(phantomQuery);
    console.log(`\nTasks with phantom Motion IDs (404 errors): ${phantoms.length}`);
    
    if (phantoms.length > 0) {
      console.log('Phantom IDs:');
      phantoms.forEach(task => {
        console.log(`- ${task.notion_name}: ${task.motion_task_id} (${task.error_count} errors)`);
      });
    }
    
    // 5. Check scheduled tasks without Motion IDs
    const scheduledNoIdQuery = `
      SELECT 
        notion_name,
        notion_duration,
        notion_due_date,
        motion_sync_needed
      FROM sync_tasks 
      WHERE schedule_checkbox = true 
        AND motion_task_id IS NULL
    `;
    
    const scheduledNoId = await database.all(scheduledNoIdQuery);
    console.log(`\nScheduled tasks without Motion IDs: ${scheduledNoId.length}`);
    
    if (scheduledNoId.length > 0) {
      console.log('Tasks ready to create in Motion:');
      scheduledNoId.slice(0, 5).forEach(task => {
        console.log(`- ${task.notion_name}`);
        console.log(`  Duration: ${task.notion_duration || 'Not set'}`);
        console.log(`  Due Date: ${task.notion_due_date || 'Not set'}`);
        console.log(`  Sync Needed: ${task.motion_sync_needed}`);
      });
    }
    
    // 6. Force clear recent attempts for testing
    console.log('\n=== Clearing Recent Attempts ===');
    const clearResult = await database.pool.query(`
      UPDATE sync_tasks 
      SET motion_last_attempt = NULL
      WHERE motion_sync_needed = true
        AND motion_last_attempt IS NOT NULL
      RETURNING notion_name
    `);
    
    console.log(`Cleared recent attempts for ${clearResult.rowCount} tasks`);
    
    await database.close();
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkMotionSyncState();