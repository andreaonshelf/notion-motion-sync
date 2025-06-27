require('dotenv').config();
const database = require('./src/database');
const notionClient = require('./src/services/notionClient');
const motionClient = require('./src/services/motionClient');
const logger = require('./src/utils/logger');

async function checkMissingMotionId() {
  try {
    await database.initialize();
    
    console.log('\n=== Checking for AI Forge GTM plan ===\n');
    
    // First, check Notion for all scheduled tasks
    const notionTasks = await notionClient.queryDatabase();
    const scheduledTasks = notionTasks.filter(task => task.schedule);
    
    console.log(`Found ${scheduledTasks.length} scheduled tasks in Notion:\n`);
    
    scheduledTasks.forEach(task => {
      console.log(`- ${task.name}: ${task.motionTaskId || 'NO MOTION ID'}`);
    });
    
    // Find the AI Forge task
    const aiForgeTask = scheduledTasks.find(task => 
      task.name.toLowerCase().includes('ai forge') && 
      task.name.toLowerCase().includes('gtm')
    );
    
    if (!aiForgeTask) {
      console.log('\n❌ Could not find "AI Forge GTM plan" in Notion scheduled tasks');
      return;
    }
    
    console.log(`\n=== Found AI Forge GTM plan ===`);
    console.log(`Notion Page ID: ${aiForgeTask.id}`);
    console.log(`Name: ${aiForgeTask.name}`);
    console.log(`Schedule: ${aiForgeTask.schedule}`);
    console.log(`Motion ID: ${aiForgeTask.motionTaskId || 'NONE'}`);
    
    // Check database state
    const dbTask = await database.get(
      'SELECT * FROM sync_tasks WHERE notion_page_id = $1',
      [aiForgeTask.id]
    );
    
    if (!dbTask) {
      console.log('\n❌ Task not found in database! This is the problem.');
      console.log('The task needs to be added to the database first.');
      
      // Add it to database
      console.log('\n📝 Adding task to database...');
      await database.upsertSyncTask(aiForgeTask.id, {
        name: aiForgeTask.name,
        lastEdited: aiForgeTask.lastEdited,
        schedule: aiForgeTask.schedule,
        duration: aiForgeTask.duration,
        dueDate: aiForgeTask.dueDate,
        status: aiForgeTask.status,
        priority: aiForgeTask.priority,
        startOn: aiForgeTask.startOn
      });
      
      console.log('✅ Task added to database');
      
      // Mark it as needing Motion sync
      await database.run(
        `UPDATE sync_tasks 
         SET motion_sync_needed = true, 
             motion_priority = 1,
             notion_sync_needed = true
         WHERE notion_page_id = $1`,
        [aiForgeTask.id]
      );
      
      console.log('✅ Marked for Motion sync with high priority');
      console.log('\n🚀 The task should be picked up in the next slow sync (within 3 minutes)');
      
    } else {
      console.log('\n=== Database state ===');
      console.log(`Motion ID: ${dbTask.motion_task_id || 'NULL'}`);
      console.log(`Schedule checkbox: ${dbTask.schedule_checkbox}`);
      console.log(`Motion sync needed: ${dbTask.motion_sync_needed}`);
      console.log(`Motion priority: ${dbTask.motion_priority}`);
      console.log(`Last Motion attempt: ${dbTask.motion_last_attempt || 'Never'}`);
      console.log(`Sync status: ${dbTask.sync_status}`);
      
      if (!dbTask.motion_task_id && dbTask.schedule_checkbox) {
        console.log('\n⚠️  Task is scheduled but has no Motion ID');
        
        // Check if it exists in Motion by name
        console.log('\n🔍 Checking if task exists in Motion...');
        const motionTasks = await motionClient.listTasks();
        const existingMotion = motionTasks.tasks.find(t => 
          t.name.toLowerCase().includes('ai forge') && 
          t.name.toLowerCase().includes('gtm')
        );
        
        if (existingMotion) {
          console.log(`\n✅ Found in Motion with ID: ${existingMotion.id}`);
          console.log('📝 Updating database with Motion ID...');
          
          await database.completeMotionSync(aiForgeTask.id, existingMotion.id);
          await database.updateMotionFields(aiForgeTask.id, existingMotion);
          
          console.log('✅ Database updated with Motion ID and fields');
        } else {
          console.log('\n❌ Not found in Motion');
          console.log('📝 Marking for immediate Motion creation...');
          
          await database.run(
            `UPDATE sync_tasks 
             SET motion_sync_needed = true, 
                 motion_priority = 1,
                 motion_last_attempt = NULL,
                 sync_status = 'pending'
             WHERE notion_page_id = $1`,
            [aiForgeTask.id]
          );
          
          console.log('✅ Marked for immediate Motion sync');
        }
      }
    }
    
    // Check Motion tasks count
    console.log('\n=== Motion workspace check ===');
    const motionResponse = await motionClient.listTasks();
    console.log(`Total tasks in Motion: ${motionResponse.tasks.length}`);
    
    const scheduledInMotion = motionResponse.tasks.filter(t => 
      t.status !== 'Completed' && t.status !== 'Done'
    );
    console.log(`Active tasks in Motion: ${scheduledInMotion.length}`);
    
  } catch (error) {
    console.error('\nError:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  } finally {
    process.exit(0);
  }
}

checkMissingMotionId();