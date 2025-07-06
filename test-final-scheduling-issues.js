require('dotenv').config();
const notionClient = require('./src/services/notionClient');

async function testFinalSchedulingIssues() {
  try {
    console.log('Checking if Motion Scheduling Issue field is now working in Notion...');
    
    // Get all tasks from Notion
    const tasks = await notionClient.queryDatabase();
    const tasksWithMotionIds = tasks.filter(t => t.motionTaskId);
    
    console.log(`\nFound ${tasksWithMotionIds.length} tasks with Motion IDs:`);
    
    // Let's query the raw Notion page data to see Motion fields
    for (const task of tasksWithMotionIds.slice(0, 5)) {
      console.log(`\n${task.name}:`);
      console.log(`  Motion ID: ${task.motionTaskId}`);
      
      // Get raw page data to see Motion fields
      try {
        const rawPage = await notionClient.client.pages.retrieve({ page_id: task.id });
        const properties = rawPage.properties;
        
        console.log(`  Motion Scheduled Start: ${properties['Motion Scheduled Start']?.date?.start || 'none'}`);
        console.log(`  Motion Scheduled End: ${properties['Motion Scheduled End']?.date?.start || 'none'}`);
        console.log(`  Motion Status: ${properties['Motion Status']?.rich_text?.[0]?.plain_text || 'none'}`);
        console.log(`  Motion Scheduling Issue: ${properties['Motion Scheduling Issue']?.checkbox || false}`);
        console.log(`  Motion Completed: ${properties['Motion Completed']?.checkbox || false}`);
        console.log(`  Motion Deadline Type: ${properties['Motion Deadline Type']?.select?.name || 'none'}`);
        
      } catch (error) {
        console.log(`  Error reading page: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testFinalSchedulingIssues();