require('dotenv').config();
const database = require('./src/database');
const motionClient = require('./src/services/motionClient');
const logger = require('./src/utils/logger');

async function checkMotionSyncStatus() {
  try {
    await database.initialize();
    
    console.log('\n=== CHECKING MOTION SYNC STATUS ===\n');
    
    // 1. Check database state for scheduled tasks
    console.log('1. DATABASE STATE FOR SCHEDULED TASKS:');
    const scheduledTasks = await database.all(`
      SELECT notion_page_id, notion_name, motion_task_id, motion_sync_needed, 
             motion_last_attempt, sync_status, motion_priority
      FROM sync_tasks 
      WHERE schedule_checkbox = true
      ORDER BY notion_name
    `);
    
    console.log(`Found ${scheduledTasks.length} scheduled tasks:`);
    scheduledTasks.forEach(task => {
      console.log(`\n  ${task.notion_name}:`);
      console.log(`    - motion_task_id: ${task.motion_task_id || 'NULL'}`);
      console.log(`    - motion_sync_needed: ${task.motion_sync_needed}`);
      console.log(`    - sync_status: ${task.sync_status}`);
      console.log(`    - motion_priority: ${task.motion_priority}`);
      console.log(`    - motion_last_attempt: ${task.motion_last_attempt || 'Never'}`);
    });
    
    // 2. Check Motion API
    console.log('\n2. MOTION API STATE:');
    try {
      const motionTasks = await motionClient.listTasks();
      console.log(`Motion API returned ${motionTasks.tasks?.length || 0} tasks`);
      
      if (motionTasks.tasks?.length > 0) {
        motionTasks.tasks.forEach(task => {
          console.log(`  - ${task.name} (${task.id})`);
        });
      }
    } catch (error) {
      console.log(`Motion API error: ${error.message}`);
    }
    
    // 3. Check recent sync logs
    console.log('\n3. RECENT SYNC LOGS:');
    const recentLogs = await database.all(`
      SELECT action, status, details, created_at
      FROM sync_logs
      WHERE created_at > datetime('now', '-10 minutes')
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log(`Found ${recentLogs.length} logs from last 10 minutes:`);
    recentLogs.forEach(log => {
      console.log(`\n  ${log.created_at} - ${log.action} (${log.status})`);
      if (log.details) {
        try {
          const details = JSON.parse(log.details);
          console.log(`    Details: ${JSON.stringify(details, null, 2)}`);
        } catch (e) {
          console.log(`    Details: ${log.details}`);
        }
      }
    });
    
    // 4. Check if slow sync should create tasks
    console.log('\n4. TASKS NEEDING MOTION OPERATIONS:');
    const tasksNeedingMotion = await database.all(`
      SELECT notion_page_id, notion_name 
      FROM sync_tasks 
      WHERE motion_sync_needed = true 
      AND (motion_last_attempt IS NULL OR motion_last_attempt < datetime('now', '-2 minutes'))
      ORDER BY motion_priority, notion_name
      LIMIT 5
    `);
    
    console.log(`Found ${tasksNeedingMotion.length} tasks ready for Motion operations`);
    tasksNeedingMotion.forEach(task => {
      console.log(`  - ${task.notion_name}`);
    });
    
  } catch (error) {
    console.error('\nError:', error.message);
    if (error.stack) console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

checkMotionSyncStatus();