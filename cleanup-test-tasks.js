require('dotenv').config();
const motionClient = require('./src/services/motionClient');

async function cleanupTestTasks() {
  try {
    console.log('Cleaning up test tasks...\n');
    
    const { tasks } = await motionClient.listTasks();
    
    const testTasks = tasks.filter(task => 
      task.name.includes('Test task with') ||
      task.name === 'Test task from sync service'
    );
    
    console.log(`Found ${testTasks.length} test tasks to delete\n`);
    
    for (const task of testTasks) {
      try {
        await motionClient.deleteTask(task.id);
        console.log(`✅ Deleted: ${task.name}`);
      } catch (error) {
        console.log(`❌ Failed to delete: ${task.name} - ${error.message}`);
      }
    }
    
    console.log('\nCleanup complete');
  } catch (error) {
    console.error('Error during cleanup:', error.message);
  }
}

cleanupTestTasks();