require('dotenv').config();
const motionClient = require('./src/services/motionClient');
const notionClient = require('./src/services/notionClient');

async function checkMotionTasks() {
  try {
    console.log('Fetching Motion tasks...');
    const response = await motionClient.listTasks();
    console.log(`Found ${response.tasks.length} Motion tasks\n`);
    
    // Get all Notion tasks with Motion IDs
    console.log('Fetching Notion tasks with Motion IDs...');
    const notionTasks = await notionClient.queryDatabase();
    const notionMotionIds = new Set(
      notionTasks
        .filter(task => task.motionTaskId)
        .map(task => task.motionTaskId)
    );
    console.log(`Found ${notionMotionIds.size} Notion tasks with Motion IDs\n`);
    
    // Find Motion tasks without Notion entries
    const motionOnlyTasks = response.tasks.filter(
      task => !notionMotionIds.has(task.id)
    );
    
    console.log(`Motion tasks WITHOUT Notion entries: ${motionOnlyTasks.length}`);
    if (motionOnlyTasks.length > 0) {
      console.log('\nFirst 5 Motion-only tasks:');
      motionOnlyTasks.slice(0, 5).forEach(task => {
        console.log(`- "${task.name}" (ID: ${task.id}, Status: ${task.status.name})`);
      });
    }
    
    // Show Motion tasks that DO have Notion entries
    const syncedTasks = response.tasks.filter(
      task => notionMotionIds.has(task.id)
    );
    console.log(`\nMotion tasks WITH Notion entries: ${syncedTasks.length}`);
    if (syncedTasks.length > 0) {
      console.log('\nFirst 5 synced tasks:');
      syncedTasks.slice(0, 5).forEach(task => {
        console.log(`- "${task.name}" (ID: ${task.id})`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkMotionTasks();