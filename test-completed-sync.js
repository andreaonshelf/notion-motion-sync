require('dotenv').config();
const pollService = require('./src/services/pollService');

async function testCompletedSync() {
  try {
    console.log('🔄 TESTING COMPLETED TASK SYNC FUNCTION\n');
    
    // Run just the completed task sync function
    await pollService.syncCompletedMotionTasks();
    
    console.log('\n✅ Completed task sync function executed');
    console.log('Check Notion to see if any tasks were updated to "Done" status');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testCompletedSync();