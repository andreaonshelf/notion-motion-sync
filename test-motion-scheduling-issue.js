require('dotenv').config();
const motionClient = require('./src/services/motionClient');

async function testMotionSchedulingIssue() {
  try {
    console.log('Fetching Motion tasks to check schedulingIssue field...');
    
    const result = await motionClient.listTasks();
    const tasks = result.tasks;
    
    console.log(`Found ${tasks.length} Motion tasks`);
    
    // Check for schedulingIssue field in Motion API response
    tasks.slice(0, 5).forEach(task => {
      console.log(`\nTask: ${task.name}`);
      console.log(`  ID: ${task.id}`);
      console.log(`  schedulingIssue: ${task.schedulingIssue}`);
      console.log(`  scheduledStart: ${task.scheduledStart}`);
      console.log(`  scheduledEnd: ${task.scheduledEnd}`);
      console.log(`  status: ${task.status?.name}`);
      console.log(`  deadlineType: ${task.deadlineType}`);
      
      // Check if task has any scheduling problems
      const hasSchedulingIssue = task.schedulingIssue;
      const hasScheduledTime = task.scheduledStart && task.scheduledEnd;
      console.log(`  Has scheduling issue: ${hasSchedulingIssue}`);
      console.log(`  Has scheduled time: ${hasScheduledTime}`);
    });
    
    // Count tasks with schedulingIssue = true
    const tasksWithIssues = tasks.filter(task => task.schedulingIssue === true);
    console.log(`\nTasks with schedulingIssue = true: ${tasksWithIssues.length}/${tasks.length}`);
    
    if (tasksWithIssues.length > 0) {
      console.log('\nTasks with scheduling issues:');
      tasksWithIssues.forEach(task => {
        console.log(`- ${task.name}: schedulingIssue=${task.schedulingIssue}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
  }
}

testMotionSchedulingIssue();