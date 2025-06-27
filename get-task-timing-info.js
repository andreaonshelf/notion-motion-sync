require('dotenv').config();
const { Pool } = require('pg');

async function getTaskTimingInfo() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'notion_motion_sync',
    user: process.env.POSTGRES_USER || 'andreavillani',
    password: process.env.POSTGRES_PASSWORD || ''
  });

  try {
    // Get all tasks with timing information
    const query = `
      SELECT 
        notion_name as task_name,
        motion_task_id,
        created_at as db_created_at,
        updated_at as db_updated_at,
        motion_last_synced,
        notion_last_edited,
        sync_status,
        motion_sync_needed,
        notion_sync_needed,
        motion_last_attempt
      FROM sync_tasks
      WHERE motion_task_id IS NOT NULL
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(query);
    
    console.log('Task Timing Information:');
    console.log('========================\n');
    
    result.rows.forEach(row => {
      console.log(`Task: ${row.task_name}`);
      console.log(`Motion ID: ${row.motion_task_id}`);
      console.log(`Database Entry Created: ${row.db_created_at}`);
      console.log(`Database Entry Updated: ${row.db_updated_at}`);
      console.log(`Motion Last Synced: ${row.motion_last_synced}`);
      console.log(`Notion Last Edited: ${row.notion_last_edited}`);
      console.log(`Sync Status: ${row.sync_status}`);
      console.log(`Motion Sync Needed: ${row.motion_sync_needed}`);
      console.log(`Notion Sync Needed: ${row.notion_sync_needed}`);
      console.log(`Motion Last Attempt: ${row.motion_last_attempt}`);
      console.log('---\n');
    });
    
    // Also get sync history for these tasks
    console.log('\nSync History:');
    console.log('=============\n');
    
    const historyQuery = `
      SELECT 
        motion_task_id,
        action,
        timestamp,
        changes,
        error
      FROM sync_history
      WHERE motion_task_id IN (SELECT motion_task_id FROM sync_tasks WHERE motion_task_id IS NOT NULL)
      ORDER BY timestamp DESC
      LIMIT 20
    `;
    
    const historyResult = await pool.query(historyQuery);
    
    historyResult.rows.forEach(row => {
      console.log(`Time: ${row.timestamp}`);
      console.log(`Motion ID: ${row.motion_task_id}`);
      console.log(`Action: ${row.action}`);
      if (row.changes) console.log(`Changes: ${row.changes}`);
      if (row.error) console.log(`Error: ${row.error}`);
      console.log('---\n');
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

getTaskTimingInfo();