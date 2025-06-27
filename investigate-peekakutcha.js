require('dotenv').config();
const database = require('./src/database');
const logger = require('./src/utils/logger');

async function investigate() {
  try {
    await database.initialize();
    
    // Find Peekakutcha task
    const tasks = await database.all(`
      SELECT * FROM sync_tasks 
      WHERE notion_name ILIKE '%peekakutcha%'
    `);
    
    console.log('\n=== PEEKAKUTCHA TASK STATE ===');
    if (tasks.length === 0) {
      console.log('No task found with name containing "peekakutcha"');
      
      // Search more broadly
      const allTasks = await database.all(`
        SELECT notion_page_id, notion_name, motion_task_id, 
               schedule_checkbox, motion_sync_needed, notion_sync_needed,
               sync_status, error_message, updated_at
        FROM sync_tasks 
        ORDER BY updated_at DESC
        LIMIT 20
      `);
      
      console.log('\n=== RECENT TASKS ===');
      allTasks.forEach(task => {
        console.log(`- ${task.notion_name}: Motion ID=${task.motion_task_id}, Schedule=${task.schedule_checkbox}, Motion sync needed=${task.motion_sync_needed}, Notion sync needed=${task.notion_sync_needed}`);
      });
    } else {
      const task = tasks[0];
      console.log(JSON.stringify(task, null, 2));
      
      // Check sync history
      const history = await database.all(`
        SELECT * FROM sync_history 
        WHERE notion_page_id = $1 
        ORDER BY timestamp DESC 
        LIMIT 10
      `, [task.notion_page_id]);
      
      console.log('\n=== SYNC HISTORY ===');
      history.forEach(h => {
        console.log(`${h.timestamp}: ${h.action} - ${h.changes || h.error || 'no details'}`);
      });
    }
    
    // Check tasks that need Notion sync
    const notionSyncNeeded = await database.all(`
      SELECT notion_page_id, notion_name, motion_task_id, 
             motion_scheduled_start, motion_scheduled_end,
             notion_sync_needed, updated_at
      FROM sync_tasks 
      WHERE notion_sync_needed = true
      ORDER BY updated_at ASC
    `);
    
    console.log('\n=== TASKS NEEDING NOTION SYNC ===');
    console.log(`Total: ${notionSyncNeeded.length}`);
    notionSyncNeeded.forEach(task => {
      console.log(`- ${task.notion_name}: Motion ID=${task.motion_task_id}, Updated=${task.updated_at}`);
    });
    
    await database.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

investigate();