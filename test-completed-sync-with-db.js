require('dotenv').config();
const database = require('./src/database');
const pollService = require('./src/services/pollService');

async function testCompletedSyncWithDB() {
  try {
    console.log('🔄 INITIALIZING DATABASE AND TESTING COMPLETED SYNC\n');
    
    // Initialize database first
    await database.initialize();
    console.log('✅ Database initialized');
    
    // Run the completed task sync function
    await pollService.syncCompletedMotionTasks();
    
    console.log('\n✅ Completed task sync function executed');
    console.log('Check Notion to see if any tasks were updated to "Done" status');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    process.exit(0);
  }
}

testCompletedSyncWithDB();