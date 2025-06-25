require('dotenv').config();
const database = require('./src/database');
const logger = require('./src/utils/logger');

async function checkSyncIssues() {
  try {
    console.log('\n=== Checking for sync issues ===\n');
    
    // Initialize database
    await database.initialize();
    
    // 1. Check for tasks with errors
    console.log('1. Tasks with sync errors:');
    const errorTasks = await database.all(`
      SELECT 
        notion_page_id, 
        motion_task_id, 
        notion_name, 
        error_message, 
        error_count,
        last_duration,
        last_due_date,
        updated_at
      FROM sync_tasks 
      WHERE sync_status = 'error' OR error_count > 0
      ORDER BY updated_at DESC
      LIMIT 20
    `);
    
    if (errorTasks.length > 0) {
      errorTasks.forEach(task => {
        console.log(`\nNotion: ${task.notion_page_id}`);
        console.log(`Motion: ${task.motion_task_id || 'NOT CREATED'}`);
        console.log(`Name: ${task.notion_name}`);
        console.log(`Error: ${task.error_message}`);
        console.log(`Error Count: ${task.error_count}`);
        console.log(`Duration: ${task.last_duration} min`);
        console.log(`Due Date: ${task.last_due_date}`);
        console.log(`Updated: ${task.updated_at}`);
      });
    } else {
      console.log('No tasks with errors found.');
    }
    
    // 2. Check for phantom IDs
    console.log('\n\n2. Checking for potential phantom IDs:');
    const phantomCandidates = await database.all(`
      SELECT 
        notion_page_id, 
        motion_task_id, 
        notion_name,
        motion_last_synced,
        updated_at
      FROM sync_tasks 
      WHERE motion_task_id IS NOT NULL 
        AND (motion_last_synced IS NULL OR motion_last_synced < NOW() - INTERVAL '1 hour')
      ORDER BY updated_at DESC
      LIMIT 10
    `);
    
    if (phantomCandidates.length > 0) {
      console.log('Tasks that might have phantom Motion IDs:');
      phantomCandidates.forEach(task => {
        console.log(`\n- ${task.notion_name}`);
        console.log(`  Notion ID: ${task.notion_page_id}`);
        console.log(`  Motion ID: ${task.motion_task_id}`);
        console.log(`  Last synced: ${task.motion_last_synced || 'NEVER'}`);
      });
    } else {
      console.log('No potential phantom IDs found.');
    }
    
    // 3. Check recent sync history for duration+date tasks
    console.log('\n\n3. Recent sync history for tasks with duration + date:');
    const recentHistory = await database.all(`
      SELECT 
        h.notion_page_id,
        h.motion_task_id,
        h.action,
        h.error,
        h.timestamp,
        h.changes
      FROM sync_history h
      WHERE h.timestamp > NOW() - INTERVAL '24 hours'
        AND (h.changes LIKE '%duration%' OR h.error LIKE '%duration%' OR h.error LIKE '%phantom%')
      ORDER BY h.timestamp DESC
      LIMIT 20
    `);
    
    if (recentHistory.length > 0) {
      recentHistory.forEach(entry => {
        console.log(`\n${entry.timestamp}: ${entry.action}`);
        if (entry.notion_page_id) console.log(`Notion: ${entry.notion_page_id}`);
        if (entry.motion_task_id) console.log(`Motion: ${entry.motion_task_id}`);
        if (entry.error) console.log(`Error: ${entry.error}`);
        if (entry.changes) {
          try {
            const changes = JSON.parse(entry.changes);
            if (changes.duration || changes.dueDate) {
              console.log(`Changes: duration=${changes.duration}, dueDate=${changes.dueDate}`);
            }
          } catch (e) {
            console.log(`Changes: ${entry.changes}`);
          }
        }
      });
    } else {
      console.log('No recent sync history with duration/date issues found.');
    }
    
    // 4. Summary stats
    console.log('\n\n4. Summary statistics:');
    const stats = await database.get(`
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(motion_task_id) as tasks_with_motion_id,
        COUNT(CASE WHEN sync_status = 'error' THEN 1 END) as error_count,
        COUNT(CASE WHEN error_count > 0 THEN 1 END) as tasks_with_errors,
        COUNT(CASE WHEN last_duration IS NOT NULL AND last_due_date IS NOT NULL THEN 1 END) as tasks_with_duration_and_date
      FROM sync_tasks
    `);
    
    console.log(`Total tasks tracked: ${stats.total_tasks}`);
    console.log(`Tasks with Motion ID: ${stats.tasks_with_motion_id}`);
    console.log(`Tasks in error state: ${stats.error_count}`);
    console.log(`Tasks with error history: ${stats.tasks_with_errors}`);
    console.log(`Tasks with duration + date: ${stats.tasks_with_duration_and_date}`);
    
    await database.close();
    
  } catch (error) {
    console.error('Error checking sync issues:', error);
    logger.error('Error checking sync issues', { error: error.message });
  }
}

checkSyncIssues();