require('dotenv').config();
const motionClient = require('./src/services/motionClient');
const notionClient = require('./src/services/notionClient');

async function testMotionFieldsSync() {
  try {
    console.log('\n=== TESTING MOTION FIELDS SYNC ===\n');
    
    // Test with the scheduled task
    const motionTaskId = 'I8Y8VH3zQIyIkCgiWKW8k';
    
    // 1. Get Motion task data
    console.log('1. Fetching Motion task data...');
    const motionTask = await motionClient.getTask(motionTaskId);
    
    console.log('\nMotion Task Data:');
    console.log(`  Name: ${motionTask.name}`);
    console.log(`  ID: ${motionTask.id}`);
    console.log(`  Scheduled Start: ${motionTask.scheduledStart}`);
    console.log(`  Scheduled End: ${motionTask.scheduledEnd}`);
    console.log(`  Duration: ${motionTask.duration} minutes`);
    console.log(`  Due Date: ${motionTask.dueDate}`);
    console.log(`  Status: ${motionTask.status?.name}`);
    console.log(`  Completed: ${motionTask.completed}`);
    console.log(`  Scheduling Issue: ${motionTask.schedulingIssue}`);
    
    // 2. Find corresponding Notion task
    console.log('\n2. Finding corresponding Notion task...');
    const notionTasks = await notionClient.queryDatabase();
    const notionTask = notionTasks.find(t => t.motionTaskId === motionTaskId);
    
    if (notionTask) {
      console.log('\nNotion Task Data:');
      console.log(`  Name: ${notionTask.name}`);
      console.log(`  ID: ${notionTask.id}`);
      console.log(`  Motion Task ID: ${notionTask.motionTaskId}`);
      console.log(`  Status: ${notionTask.status}`);
      console.log(`  Duration: ${notionTask.duration}`);
      console.log(`  Due Date: ${notionTask.dueDate}`);
      console.log(`  Schedule checkbox: ${notionTask.schedule}`);
      
      // Check if Motion scheduling info would sync to Notion
      console.log('\n3. Checking what would sync to Notion:');
      const hasScheduling = motionTask.scheduledStart && motionTask.scheduledEnd;
      console.log(`  Has scheduling info: ${hasScheduling}`);
      
      if (hasScheduling) {
        console.log(`  Would update Notion schedule checkbox to: true`);
        console.log(`  Motion scheduled time: ${motionTask.scheduledStart} to ${motionTask.scheduledEnd}`);
      }
      
      // Check current implementation
      console.log('\n4. Current sync logic check:');
      console.log(`  Motion has scheduledStart: ${!!motionTask.scheduledStart}`);
      console.log(`  Motion has scheduledEnd: ${!!motionTask.scheduledEnd}`);
      console.log(`  Notion schedule checkbox: ${notionTask.schedule}`);
      console.log(`  Would sync update this? ${hasScheduling && !notionTask.schedule}`);
      
    } else {
      console.log('  NOT FOUND in Notion!');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testMotionFieldsSync();