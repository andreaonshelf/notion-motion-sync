require('dotenv').config();
const motionClient = require('./src/services/motionClient');

async function testList() {
  try {
    console.log('Testing Motion listTasks...');
    const result = await motionClient.listTasks();
    console.log('Response structure:', {
      hasData: !!result,
      hasTasks: !!result?.tasks,
      isArray: Array.isArray(result?.tasks),
      taskCount: result?.tasks?.length || 0,
      keys: Object.keys(result || {})
    });
    
    if (result?.tasks?.[0]) {
      console.log('First task structure:', Object.keys(result.tasks[0]));
    }
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Status:', error.response?.status);
    console.error('Response:', error.response?.data);
  }
}

testList();