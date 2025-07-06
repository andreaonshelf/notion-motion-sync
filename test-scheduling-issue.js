require('dotenv').config();
const notionClient = require('./src/services/notionClient');

async function testSchedulingIssue() {
  try {
    // Test the buildProperties method with different schedulingIssue values
    console.log('Testing Motion Scheduling Issue field mapping...');
    
    const testCases = [
      { motionSchedulingIssue: true, expected: 'true (checkbox checked)' },
      { motionSchedulingIssue: false, expected: 'false (checkbox unchecked)' },
      { motionSchedulingIssue: null, expected: 'false (null becomes false)' },
      { motionSchedulingIssue: undefined, expected: 'field not included' }
    ];
    
    testCases.forEach((testCase, index) => {
      const properties = notionClient.buildProperties(testCase);
      console.log(`\nTest ${index + 1}: motionSchedulingIssue = ${testCase.motionSchedulingIssue}`);
      console.log(`Expected: ${testCase.expected}`);
      console.log(`Result:`, properties['Motion Scheduling Issue']);
    });
    
    // Test actual Notion page query to see current values
    console.log('\n--- Checking actual Notion database ---');
    const tasks = await notionClient.queryDatabase();
    
    const tasksWithMotionIds = tasks.filter(task => task.motionTaskId);
    console.log(`Found ${tasksWithMotionIds.length} tasks with Motion IDs`);
    
    tasksWithMotionIds.slice(0, 3).forEach(task => {
      console.log(`- ${task.name}: Motion ID=${task.motionTaskId}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSchedulingIssue();