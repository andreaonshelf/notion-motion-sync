require('dotenv').config();
const database = require('./src/database');
const axios = require('axios');
const { config } = require('./src/config');

async function debugSpecificTask() {
  try {
    console.log('🔍 DEBUGGING "Prova prova" TASK SYNC\n');
    
    await database.initialize();
    
    // Extract page ID from the URL
    const pageId = '2216c10e-5e22-80df-8697-d21ef1d3ba36';
    console.log(`Looking for task with page ID: ${pageId}`);
    
    // Check database for this specific task
    const dbTask = await database.get(`
      SELECT * FROM sync_tasks 
      WHERE notion_page_id = $1
    `, [pageId]);
    
    if (!dbTask) {
      console.log('❌ Task not found in database');
      return;
    }
    
    console.log('\n📝 Database record:');
    console.log(`Name: ${dbTask.notion_name}`);
    console.log(`Status: ${dbTask.status}`);
    console.log(`Motion Task ID: ${dbTask.motion_task_id}`);
    console.log(`Motion Completed: ${dbTask.motion_completed}`);
    console.log(`Motion Completed Time: ${dbTask.motion_completed_time}`);
    console.log(`Notion Sync Needed: ${dbTask.notion_sync_needed}`);
    console.log(`Schedule Checkbox: ${dbTask.schedule_checkbox}`);
    
    if (!dbTask.motion_task_id) {
      console.log('\n⚠️  No Motion ID found - task was never synced to Motion');
      return;
    }
    
    // Check if Motion task exists and is completed
    console.log('\n🔍 Checking Motion API...');
    
    const client = axios.create({
      baseURL: config.motion.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.motion.apiKey
      }
    });
    
    // Check in active tasks
    try {
      const activeResponse = await client.get('/tasks');
      const activeTask = activeResponse.data.tasks.find(t => t.id === dbTask.motion_task_id);
      
      if (activeTask) {
        console.log('✅ Found in active Motion tasks:');
        console.log(`   Name: ${activeTask.name}`);
        console.log(`   Status: ${activeTask.status?.name}`);
        console.log(`   Completed: ${activeTask.completed}`);
        console.log(`   Completed Time: ${activeTask.completedTime}`);
        
        if (activeTask.status?.name !== 'Completed' && !activeTask.completed) {
          console.log('\n❌ Task is NOT marked as completed in Motion');
          console.log('Make sure you actually completed it in Motion UI');
          return;
        }
      }
    } catch (error) {
      console.log('Error checking active tasks:', error.message);
    }
    
    // Check in completed tasks
    try {
      const completedResponse = await client.get('/tasks', { 
        params: { status: 'Completed' } 
      });
      
      const completedTask = completedResponse.data.tasks.find(t => t.id === dbTask.motion_task_id);
      
      if (completedTask) {
        console.log('✅ Found in completed Motion tasks:');
        console.log(`   Name: ${completedTask.name}`);
        console.log(`   Status: ${completedTask.status?.name}`);
        console.log(`   Completed: ${completedTask.completed}`);
        console.log(`   Completed Time: ${completedTask.completedTime}`);
        
        console.log('\n🔄 Running completed task sync...');
        
        // Update database manually for this task
        await database.updateMotionFields(dbTask.notion_page_id, completedTask);
        
        await database.run(`
          UPDATE sync_tasks 
          SET status = 'Done', 
              notion_sync_needed = true,
              motion_completed = true,
              motion_completed_time = $1
          WHERE notion_page_id = $2
        `, [completedTask.completedTime, dbTask.notion_page_id]);
        
        console.log('✅ Updated database - triggering Notion sync...');
        
        // Trigger fast sync to push to Notion
        const pollService = require('./src/services/pollService');
        await pollService.syncDatabaseToNotion();
        
        console.log('✅ Sync completed - check Notion!');
        
      } else {
        console.log('❌ Task not found in completed Motion tasks');
        console.log('This means Motion either:');
        console.log('1. Has not marked it as completed yet');
        console.log('2. The task was deleted from Motion');
        console.log('3. There\'s a Motion ID mismatch');
      }
      
    } catch (error) {
      console.log('Error checking completed tasks:', error.message);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

debugSpecificTask();