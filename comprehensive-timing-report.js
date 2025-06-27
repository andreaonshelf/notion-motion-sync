require('dotenv').config();
const { Pool } = require('pg');
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

async function getComprehensiveTiming() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'notion_motion_sync',
    user: process.env.POSTGRES_USER || 'andreavillani',
    password: process.env.POSTGRES_PASSWORD || ''
  });

  try {
    // Get Motion tasks from API
    const motionResponse = await fetch('https://notion-motion-sync-production.up.railway.app/debug-motion/list-all');
    const motionData = await motionResponse.json();
    const motionTasks = {};
    motionData.tasks.forEach(task => {
      motionTasks[task.id] = task;
    });

    // Get Notion pages
    const notionResponse = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: 'Motion Task ID',
        rich_text: {
          is_not_empty: true
        }
      }
    });

    // Get database records
    const dbQuery = `
      SELECT 
        notion_page_id,
        notion_name as task_name,
        motion_task_id,
        created_at as db_created_at,
        updated_at as db_updated_at,
        motion_last_synced,
        notion_last_edited,
        sync_status,
        motion_last_attempt
      FROM sync_tasks
      WHERE motion_task_id IS NOT NULL
      ORDER BY notion_name
    `;
    
    const dbResult = await pool.query(dbQuery);
    const dbRecords = {};
    dbResult.rows.forEach(row => {
      dbRecords[row.motion_task_id] = row;
    });

    // Combine all data
    console.log('Comprehensive Task Timing Report');
    console.log('================================');
    console.log('');
    
    // Create table header
    console.log('| Task Name | Motion ID | Created in Motion | Written to DB | Written to Notion | Time to DB | Time to Notion |');
    console.log('|-----------|-----------|-------------------|---------------|------------------|------------|----------------|');

    for (const page of notionResponse.results) {
      const title = page.properties['Name']?.title?.[0]?.text?.content || 'Untitled';
      const motionId = page.properties['Motion Task ID']?.rich_text?.[0]?.text?.content || '';
      
      if (motionId && motionTasks[motionId] && dbRecords[motionId]) {
        const motionTask = motionTasks[motionId];
        const dbRecord = dbRecords[motionId];
        
        // Calculate time differences
        const motionCreated = new Date(motionTask.createdTime);
        const dbCreated = new Date(dbRecord.db_created_at);
        const notionUpdated = new Date(page.last_edited_time);
        
        const timeToDb = Math.round((dbCreated - motionCreated) / 1000 / 60); // minutes
        const timeToNotion = Math.round((notionUpdated - motionCreated) / 1000 / 60); // minutes
        
        console.log(`| ${title.padEnd(40).substring(0, 40)} | ${motionId.substring(0, 10)}... | ${motionCreated.toLocaleString()} | ${dbCreated.toLocaleString()} | ${notionUpdated.toLocaleString()} | ${timeToDb} min | ${timeToNotion} min |`);
      }
    }
    
    console.log('\n\nDetailed Timeline for Each Task:');
    console.log('================================\n');
    
    for (const page of notionResponse.results) {
      const title = page.properties['Name']?.title?.[0]?.text?.content || 'Untitled';
      const motionId = page.properties['Motion Task ID']?.rich_text?.[0]?.text?.content || '';
      
      if (motionId && motionTasks[motionId] && dbRecords[motionId]) {
        const motionTask = motionTasks[motionId];
        const dbRecord = dbRecords[motionId];
        
        console.log(`Task: ${title}`);
        console.log(`Motion ID: ${motionId}`);
        console.log('Timeline:');
        console.log(`  1. Created in Motion: ${new Date(motionTask.createdTime).toLocaleString()}`);
        console.log(`  2. Database entry created: ${new Date(dbRecord.db_created_at).toLocaleString()}`);
        console.log(`  3. Motion ID written to Notion: ${new Date(page.last_edited_time).toLocaleString()}`);
        console.log(`  4. Last Motion update: ${new Date(motionTask.updatedTime).toLocaleString()}`);
        if (dbRecord.motion_last_synced) {
          console.log(`  5. Last sync to Motion: ${new Date(dbRecord.motion_last_synced).toLocaleString()}`);
        }
        console.log('---\n');
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

getComprehensiveTiming();