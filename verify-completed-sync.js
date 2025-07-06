require('dotenv').config();
const notionClient = require('./src/services/notionClient');

async function verifyCompletedSync() {
  try {
    console.log('🔍 VERIFYING COMPLETED TASK SYNC IN NOTION\n');
    
    const tasks = await notionClient.queryDatabase();
    
    // Check for completed tasks
    const completedTasks = tasks.filter(task => task.status === 'Done');
    const targetTasks = tasks.filter(task => 
      task.name === 'Pecha Kutcha' || task.name === 'New Version of Pitch Deck'
    );
    
    console.log(`Found ${completedTasks.length} tasks with "Done" status in Notion:`);
    completedTasks.forEach(task => {
      console.log(`✅ ${task.name} - Status: ${task.status}, Motion ID: ${task.motionTaskId}`);
    });
    
    console.log('\nChecking specific target tasks:');
    targetTasks.forEach(task => {
      const status = task.status === 'Done' ? '✅ COMPLETED' : '❌ NOT COMPLETED';
      console.log(`${status} ${task.name} - Status: ${task.status}`);
    });
    
    if (targetTasks.every(task => task.status === 'Done')) {
      console.log('\n🎉 SUCCESS! Both completed Motion tasks are now marked as "Done" in Notion!');
    } else {
      console.log('\n⏳ Some tasks may still be syncing. Check Notion manually.');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

verifyCompletedSync();