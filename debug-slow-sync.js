require('dotenv').config();
const database = require('./src/database');
const logger = require('./src/utils/logger');

async function debugSlowSync() {
  try {
    await database.initialize();
    
    console.log('\n=== CHECKING SCHEDULED TASKS ===');
    const scheduledTasks = await database.all(`
      SELECT 
        notion_page_id,
        notion_name,
        schedule_checkbox,
        motion_task_id,
        motion_sync_needed,
        motion_last_attempt,
        notion_last_edited,
        motion_last_synced,
        updated_at
      FROM sync_tasks 
      WHERE schedule_checkbox = true
      ORDER BY updated_at DESC
      LIMIT 10
    `);
    
    console.log(`Found ${scheduledTasks.length} scheduled tasks:`);
    scheduledTasks.forEach(task => {
      console.log(`\n- ${task.notion_name}`);
      console.log(`  Motion ID: ${task.motion_task_id || 'NONE'}`);
      console.log(`  Motion sync needed: ${task.motion_sync_needed}`);
      console.log(`  Last Motion attempt: ${task.motion_last_attempt || 'NEVER'}`);
      console.log(`  Notion edited: ${task.notion_last_edited}`);
      console.log(`  Motion synced: ${task.motion_last_synced || 'NEVER'}`);
    });
    
    console.log('\n=== DETECTING MOTION SYNC NEEDS ===');
    console.log('Running detectMotionSyncNeeds()...');
    await database.detectMotionSyncNeeds();
    
    console.log('\n=== TASKS NEEDING MOTION OPERATIONS ===');
    const tasksNeedingMotion = await database.getMotionTasksToProcess(100);
    console.log(`Found ${tasksNeedingMotion.length} tasks needing Motion operations:`);
    
    tasksNeedingMotion.forEach(task => {
      console.log(`\n- ${task.notion_name}`);
      console.log(`  Motion ID: ${task.motion_task_id || 'NONE'}`);
      console.log(`  Priority: ${task.motion_priority}`);
      console.log(`  Last attempt: ${task.motion_last_attempt || 'NEVER'}`);
      console.log(`  Schedule: ${task.schedule_checkbox}`);
    });
    
    // Check the SQL conditions manually
    console.log('\n=== CHECKING SQL CONDITIONS ===');
    
    // New scheduled tasks without Motion ID
    const newScheduled = await database.all(`
      SELECT notion_name, motion_task_id, motion_sync_needed, motion_last_attempt
      FROM sync_tasks 
      WHERE schedule_checkbox = true 
        AND motion_sync_needed = false
        AND (
          motion_task_id IS NULL 
          OR (
            motion_task_id IS NOT NULL 
            AND (
              motion_last_attempt IS NULL 
              OR motion_last_attempt < NOW() - INTERVAL '10 minutes'
            )
          )
        )
    `);
    console.log(`\nNew scheduled tasks that should be marked: ${newScheduled.length}`);
    newScheduled.forEach(t => console.log(`  - ${t.notion_name} (Motion ID: ${t.motion_task_id || 'NONE'})`));
    
    // Unscheduled tasks with Motion ID
    const unscheduledWithMotion = await database.all(`
      SELECT notion_name, motion_task_id, motion_sync_needed
      FROM sync_tasks 
      WHERE schedule_checkbox = false 
        AND motion_task_id IS NOT NULL
        AND motion_sync_needed = false
    `);
    console.log(`\nUnscheduled tasks with Motion ID: ${unscheduledWithMotion.length}`);
    unscheduledWithMotion.forEach(t => console.log(`  - ${t.notion_name} (Motion ID: ${t.motion_task_id})`));
    
    // Updated scheduled tasks
    const updatedScheduled = await database.all(`
      SELECT notion_name, motion_task_id, notion_last_edited, motion_last_synced
      FROM sync_tasks 
      WHERE schedule_checkbox = true 
        AND motion_task_id IS NOT NULL
        AND notion_last_edited > motion_last_synced
        AND motion_sync_needed = false
    `);
    console.log(`\nUpdated scheduled tasks: ${updatedScheduled.length}`);
    updatedScheduled.forEach(t => console.log(`  - ${t.notion_name} (edited: ${t.notion_last_edited}, synced: ${t.motion_last_synced})`));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await database.close();
  }
}

debugSlowSync();