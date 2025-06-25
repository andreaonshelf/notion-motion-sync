require('dotenv').config();
const motionClient = require('./src/services/motionClient');
const logger = require('./src/utils/logger');

async function testDurationAndDate() {
  try {
    console.log('\n=== Testing Motion task creation with duration + date ===\n');
    
    // Test 1: Task with both duration and date
    console.log('Test 1: Creating task with duration (60 min) + due date...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueDateString = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const task1 = await motionClient.createTask({
      name: 'Test task with duration and date',
      description: 'This task has both duration and date',
      duration: 60,  // 60 minutes
      dueDate: dueDateString
    });
    
    console.log('✅ Task created successfully:', {
      id: task1.id,
      name: task1.name,
      duration: task1.duration,
      dueDate: task1.dueDate
    });
    
    // Verify the task exists
    console.log('\nVerifying task exists in Motion...');
    try {
      const verifyTask = await motionClient.getTask(task1.id);
      console.log('✅ Task verified:', {
        id: verifyTask.id,
        name: verifyTask.name,
        duration: verifyTask.duration,
        dueDate: verifyTask.dueDate,
        status: verifyTask.status
      });
    } catch (verifyError) {
      console.log('❌ Task verification failed:', verifyError.message);
      console.log('This might be a phantom ID issue!');
    }
    
    // Test 2: Task with only duration
    console.log('\n\nTest 2: Creating task with only duration (30 min)...');
    const task2 = await motionClient.createTask({
      name: 'Test task with duration only',
      description: 'This task has only duration',
      duration: 30  // 30 minutes
    });
    
    console.log('✅ Task created successfully:', {
      id: task2.id,
      name: task2.name,
      duration: task2.duration
    });
    
    // Test 3: Task with only date
    console.log('\n\nTest 3: Creating task with only due date...');
    const task3 = await motionClient.createTask({
      name: 'Test task with date only',
      description: 'This task has only due date',
      dueDate: dueDateString
    });
    
    console.log('✅ Task created successfully:', {
      id: task3.id,
      name: task3.name,
      dueDate: task3.dueDate
    });
    
    // List all tasks to see if they appear
    console.log('\n\nListing all Motion tasks to verify creation...');
    const allTasks = await motionClient.listTasks();
    
    const createdTaskIds = [task1.id, task2.id, task3.id];
    const foundTasks = allTasks.tasks.filter(t => createdTaskIds.includes(t.id));
    
    console.log(`\nFound ${foundTasks.length} of 3 created tasks in Motion list`);
    foundTasks.forEach(task => {
      console.log(`- ${task.name} (ID: ${task.id})`);
    });
    
    if (foundTasks.length < 3) {
      console.log('\n⚠️  WARNING: Some tasks were not found in Motion!');
      console.log('This suggests the phantom ID issue where Motion returns success but doesn\'t create the task.');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testDurationAndDate();