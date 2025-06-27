require('dotenv').config();
const { Pool } = require('pg');

async function analyzeTimings() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'notion_motion_sync',
    user: process.env.POSTGRES_USER || 'andreavillani',
    password: process.env.POSTGRES_PASSWORD || ''
  });

  try {
    // Get all sync history
    const historyQuery = `
      SELECT 
        h.notion_page_id,
        h.motion_task_id,
        h.action,
        h.timestamp,
        h.changes,
        h.error,
        t.notion_name
      FROM sync_history h
      LEFT JOIN sync_tasks t ON h.notion_page_id = t.notion_page_id
      WHERE h.motion_task_id IS NOT NULL
      ORDER BY h.timestamp ASC
    `;
    
    const historyResult = await pool.query(historyQuery);
    
    // Group by Motion ID
    const taskHistories = {};
    historyResult.rows.forEach(row => {
      if (!taskHistories[row.motion_task_id]) {
        taskHistories[row.motion_task_id] = {
          name: row.notion_name,
          events: []
        };
      }
      taskHistories[row.motion_task_id].events.push({
        action: row.action,
        timestamp: row.timestamp,
        changes: row.changes,
        error: row.error
      });
    });
    
    console.log('Task Creation and Sync Timeline Analysis');
    console.log('========================================\n');
    
    for (const [motionId, data] of Object.entries(taskHistories)) {
      console.log(`Task: ${data.name || 'Unknown'}`);
      console.log(`Motion ID: ${motionId}`);
      console.log('Event Timeline:');
      
      data.events.forEach((event, index) => {
        const time = new Date(event.timestamp).toLocaleString();
        console.log(`  ${index + 1}. [${time}] ${event.action}`);
        if (event.changes) {
          try {
            const changes = JSON.parse(event.changes);
            if (changes.motionTaskId) {
              console.log(`     → Motion ID set: ${changes.motionTaskId}`);
            }
          } catch (e) {
            console.log(`     → Changes: ${event.changes}`);
          }
        }
        if (event.error) {
          console.log(`     → Error: ${event.error}`);
        }
      });
      console.log('---\n');
    }
    
    // Now get the current state
    console.log('\nCurrent State Summary:');
    console.log('=====================\n');
    
    const summaryQuery = `
      SELECT 
        notion_name,
        motion_task_id,
        created_at,
        updated_at,
        motion_last_synced,
        notion_last_edited,
        sync_status,
        motion_last_attempt
      FROM sync_tasks
      WHERE motion_task_id IS NOT NULL
      ORDER BY notion_name
    `;
    
    const summaryResult = await pool.query(summaryQuery);
    
    console.log('| Task | Motion ID | DB Created | Last Sync | Status |');
    console.log('|------|-----------|------------|-----------|---------|');
    
    summaryResult.rows.forEach(row => {
      const name = row.notion_name ? row.notion_name.substring(0, 30) : 'Unknown';
      const motionId = row.motion_task_id.substring(0, 10);
      const created = new Date(row.created_at).toLocaleDateString();
      const lastSync = row.motion_last_synced ? new Date(row.motion_last_synced).toLocaleDateString() : 'Never';
      
      console.log(`| ${name.padEnd(30)} | ${motionId}... | ${created} | ${lastSync} | ${row.sync_status} |`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

analyzeTimings();