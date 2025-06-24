require('dotenv').config();
const motionClient = require('./src/services/motionClient');

async function debugMotionStatus() {
  try {
    console.log('Fetching Motion tasks to check status format...');
    const response = await motionClient.listTasks();
    
    // Show unique status formats
    const statusSet = new Set();
    response.tasks.forEach(task => {
      statusSet.add(JSON.stringify(task.status));
    });
    
    console.log('\nUnique Motion status formats:');
    statusSet.forEach(status => {
      console.log(status);
    });
    
    // Show first 5 tasks with their status
    console.log('\nFirst 5 tasks with status:');
    response.tasks.slice(0, 5).forEach(task => {
      console.log(`"${task.name}": ${JSON.stringify(task.status)}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugMotionStatus();