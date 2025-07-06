require('dotenv').config();
const notionClient = require('./src/services/notionClient');

async function testMotionFieldsUpdated() {
  try {
    console.log('Checking Motion fields in Notion after sync...');
    
    const tasks = await notionClient.queryDatabase();
    const tasksWithMotionIds = tasks.filter(t => t.motionTaskId);
    
    console.log(`Found ${tasksWithMotionIds.length} tasks with Motion IDs:\n`);
    
    tasksWithMotionIds.slice(0, 5).forEach(task => {
      console.log(`${task.name}:`);
      console.log(`  Motion ID: ${task.motionTaskId}`);
      console.log(`  Last edited: ${task.lastEdited}`);
    });
    
    // Check if we can get more detailed Motion field data by querying a specific page
    if (tasksWithMotionIds.length > 0) {
      const testTask = tasksWithMotionIds[0];
      console.log(`\nDetailed view of "${testTask.name}" page:`);
      
      const detailedTask = await notionClient.getTask(testTask.id);
      console.log('  Full task object:', JSON.stringify(detailedTask, null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testMotionFieldsUpdated();