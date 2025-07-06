require('dotenv').config();
const notionClient = require('./src/services/notionClient');

async function testStartOnField() {
  try {
    console.log('Testing "Start On" field in Notion tasks...');
    
    const tasks = await notionClient.queryDatabase();
    const tasksWithStartOn = tasks.filter(t => t.startOn);
    
    console.log(`\nFound ${tasksWithStartOn.length} tasks with "Start On" dates:`);
    
    tasksWithStartOn.forEach(task => {
      console.log(`- ${task.name}:`);
      console.log(`  Start On: ${task.startOn}`);
      console.log(`  Due Date: ${task.dueDate}`);
      console.log(`  Motion ID: ${task.motionTaskId || 'none'}`);
      console.log(`  Schedule checkbox: ${task.schedule}`);
    });
    
    if (tasksWithStartOn.length === 0) {
      console.log('\nNo tasks currently have "Start On" dates set.');
      console.log('You can test this by:');
      console.log('1. Setting a "Start On" date for a task in Notion');
      console.log('2. Ensuring the "Schedule" checkbox is checked');
      console.log('3. The sync will pick it up and send startOn to Motion');
    }
    
    // Check a few tasks to see their current state
    console.log(`\nChecking all ${tasks.length} tasks for Start On field:`);
    tasks.slice(0, 10).forEach(task => {
      console.log(`- ${task.name}: startOn="${task.startOn}", schedule=${task.schedule}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testStartOnField();