require('dotenv').config();
const database = require('./src/database');
const motionClient = require('./src/services/motionClient');

async function testSpecificTask() {
  try {
    await database.initialize();
    
    // Get a specific task that's failing
    const failingTask = await database.get(`
      SELECT * FROM sync_tasks 
      WHERE notion_name = 'Peekakutcha'
      AND schedule_checkbox = true 
      AND motion_task_id IS NULL
    `);
    
    if (!failingTask) {
      console.log('Task not found');
      return;
    }
    
    console.log('Testing task:', failingTask.notion_name);
    console.log('Task data:', {
      name: failingTask.notion_name,
      duration: failingTask.duration,
      dueDate: failingTask.due_date,
      startOn: failingTask.start_on,
      priority: failingTask.priority
    });
    
    const motionTaskData = {
      name: failingTask.notion_name,
      duration: failingTask.duration,
      dueDate: failingTask.due_date,
      startOn: failingTask.start_on,
      status: 'Not started',
      priority: failingTask.priority
    };
    
    try {
      const result = await motionClient.createTask(motionTaskData);
      console.log('✅ SUCCESS:', result.id);
    } catch (error) {
      console.log('❌ FAILED:', error.message);
      console.log('Status:', error.response?.status);
      console.log('Data:', error.response?.data);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

testSpecificTask();