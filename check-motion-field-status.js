require('dotenv').config();
const database = require('./src/database');
const logger = require('./src/utils/logger');

async function checkMotionFieldStatus() {
  try {
    await database.initialize();
    
    console.log('\n=== MOTION FIELD STATUS CHECK ===\n');
    
    // 1. Get stats
    const stats = await database.get(`
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(motion_task_id) as tasks_with_motion_id,
        COUNT(CASE WHEN notion_sync_needed = true THEN 1 END) as pending_notion_updates,
        COUNT(CASE WHEN motion_sync_needed = true THEN 1 END) as pending_motion_operations,
        COUNT(CASE WHEN schedule_checkbox = true THEN 1 END) as scheduled_tasks,
        COUNT(CASE WHEN schedule_checkbox = true AND motion_task_id IS NOT NULL THEN 1 END) as scheduled_with_motion,
        COUNT(CASE WHEN motion_scheduled_start IS NOT NULL THEN 1 END) as tasks_with_scheduled_start,
        COUNT(CASE WHEN motion_scheduled_end IS NOT NULL THEN 1 END) as tasks_with_scheduled_end
      FROM sync_tasks
    `);
    
    console.log('SUMMARY:');
    console.log(`- Total tasks: ${stats.total_tasks}`);
    console.log(`- Tasks with Motion ID: ${stats.tasks_with_motion_id}`);
    console.log(`- Pending Notion updates: ${stats.pending_notion_updates}`);
    console.log(`- Pending Motion operations: ${stats.pending_motion_operations}`);
    console.log(`- Scheduled tasks: ${stats.scheduled_tasks}`);
    console.log(`- Scheduled with Motion: ${stats.scheduled_with_motion}`);
    console.log(`- Tasks with scheduled start: ${stats.tasks_with_scheduled_start}`);
    console.log(`- Tasks with scheduled end: ${stats.tasks_with_scheduled_end}`);
    
    // 2. Check tasks that should have Motion fields but don't
    console.log('\n\nTASKS WITH MOTION ID BUT NO SCHEDULING FIELDS:');
    const tasksWithoutFields = await database.all(`
      SELECT 
        notion_page_id,
        notion_name,
        motion_task_id,
        motion_scheduled_start,
        motion_scheduled_end,
        motion_last_attempt,
        motion_sync_needed,
        notion_sync_needed
      FROM sync_tasks
      WHERE motion_task_id IS NOT NULL
        AND (motion_scheduled_start IS NULL OR motion_scheduled_end IS NULL)
      LIMIT 5
    `);
    
    if (tasksWithoutFields.length > 0) {
      tasksWithoutFields.forEach(task => {
        console.log(`\n- ${task.notion_name}`);
        console.log(`  Motion ID: ${task.motion_task_id}`);
        console.log(`  Scheduled start: ${task.motion_scheduled_start || 'NULL'}`);
        console.log(`  Scheduled end: ${task.motion_scheduled_end || 'NULL'}`);
        console.log(`  Motion sync needed: ${task.motion_sync_needed}`);
        console.log(`  Notion sync needed: ${task.notion_sync_needed}`);
        console.log(`  Last Motion attempt: ${task.motion_last_attempt || 'Never'}`);
      });
    } else {
      console.log('None found - all tasks with Motion IDs have scheduling fields');
    }
    
    // 3. Check tasks pending Notion sync
    console.log('\n\nTASKS PENDING NOTION SYNC:');
    const pendingNotionSync = await database.all(`
      SELECT 
        notion_page_id,
        notion_name,
        motion_task_id,
        motion_scheduled_start,
        motion_scheduled_end,
        motion_status_name,
        updated_at
      FROM sync_tasks
      WHERE notion_sync_needed = true
      ORDER BY updated_at DESC
      LIMIT 5
    `);
    
    if (pendingNotionSync.length > 0) {
      pendingNotionSync.forEach(task => {
        console.log(`\n- ${task.notion_name}`);
        console.log(`  Motion ID: ${task.motion_task_id || 'NULL'}`);
        console.log(`  Scheduled start: ${task.motion_scheduled_start || 'NULL'}`);
        console.log(`  Scheduled end: ${task.motion_scheduled_end || 'NULL'}`);
        console.log(`  Status: ${task.motion_status_name || 'NULL'}`);
        console.log(`  Updated: ${task.updated_at}`);
      });
    } else {
      console.log('None - all tasks are synced to Notion');
    }
    
    // 4. Check recent sync history
    console.log('\n\nRECENT SYNC HISTORY:');
    const recentHistory = await database.all(`
      SELECT 
        action,
        timestamp,
        notion_page_id,
        motion_task_id,
        error
      FROM sync_history
      WHERE timestamp > NOW() - INTERVAL '30 minutes'
      ORDER BY timestamp DESC
      LIMIT 10
    `);
    
    if (recentHistory.length > 0) {
      recentHistory.forEach(entry => {
        console.log(`\n${entry.timestamp} - ${entry.action}`);
        if (entry.error) {
          console.log(`  Error: ${entry.error}`);
        }
      });
    } else {
      console.log('No sync activity in the last 30 minutes');
    }
    
    // 5. Force trigger fast sync to update Notion
    console.log('\n\nTRIGGERING FAST SYNC...');
    const pollService = require('./src/services/pollService');
    await pollService.fastSync();
    console.log('Fast sync completed');
    
    // 6. Check if Notion sync needed count changed
    const newStats = await database.get(`
      SELECT 
        COUNT(CASE WHEN notion_sync_needed = true THEN 1 END) as pending_notion_updates
      FROM sync_tasks
    `);
    
    console.log(`\nNotion updates pending after sync: ${newStats.pending_notion_updates} (was ${stats.pending_notion_updates})`);
    
  } catch (error) {
    console.error('Error:', error.message);
    logger.error('Error in motion field status check', { error: error.message });
  } finally {
    await database.close();
  }
}

checkMotionFieldStatus();