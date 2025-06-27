const express = require('express');
const router = express.Router();
const notionClient = require('../services/notionClient');
const database = require('../database');
const logger = require('../utils/logger');

// Clean up stale Motion IDs in Notion based on database state
router.post('/cleanup-motion-ids', async (req, res) => {
  try {
    logger.info('Starting Notion Motion ID cleanup - database is source of truth');
    
    // Step 1: Get all tasks from Notion with their current Motion IDs
    const notionTasks = await notionClient.queryDatabase();
    logger.info(`Found ${notionTasks.length} tasks in Notion`);
    
    // Step 2: Get all Motion IDs from database
    const dbTasks = await database.all(`
      SELECT notion_page_id, notion_name, motion_task_id 
      FROM sync_tasks 
      WHERE notion_page_id IS NOT NULL
    `);
    
    // Create lookup map: notion_page_id -> database_motion_id
    const dbMotionIds = new Map();
    dbTasks.forEach(task => {
      dbMotionIds.set(task.notion_page_id, task.motion_task_id);
    });
    
    logger.info(`Found ${dbTasks.length} tasks in database`);
    
    let cleanedCount = 0;
    let syncedCount = 0;
    const results = {
      cleaned: [],
      synced: [],
      errors: []
    };
    
    // Step 3: For each Notion task, check if Motion ID matches database
    for (const notionTask of notionTasks) {
      try {
        const notionMotionId = notionTask.motionTaskId; // What Notion currently shows
        const dbMotionId = dbMotionIds.get(notionTask.id); // What database says it should be
        
        logger.info(`Checking task: ${notionTask.name}`, {
          notionPageId: notionTask.id,
          notionMotionId: notionMotionId || 'null',
          dbMotionId: dbMotionId || 'null'
        });
        
        // Check if Notion and database disagree
        if (notionMotionId !== dbMotionId) {
          logger.info(`Motion ID mismatch found for: ${notionTask.name}`, {
            notionHas: notionMotionId || 'null',
            dbHas: dbMotionId || 'null',
            action: 'will_sync_database_to_notion'
          });
          
          // Build update payload with correct Motion ID from database
          const updatePayload = {
            motionTaskId: dbMotionId || '' // Use database value (empty string clears field in Notion)
          };
          
          // If database has a Motion ID, also include any Motion fields
          if (dbMotionId) {
            const dbTask = dbTasks.find(t => t.notion_page_id === notionTask.id);
            if (dbTask) {
              const fullDbTask = await database.get(
                'SELECT * FROM sync_tasks WHERE notion_page_id = $1',
                [notionTask.id]
              );
              
              if (fullDbTask) {
                updatePayload.motionStartOn = fullDbTask.motion_start_on;
                updatePayload.motionScheduledStart = fullDbTask.motion_scheduled_start;
                updatePayload.motionScheduledEnd = fullDbTask.motion_scheduled_end;
                updatePayload.motionStatus = fullDbTask.motion_status_name;
                updatePayload.motionSchedulingIssue = fullDbTask.motion_scheduling_issue;
                updatePayload.motionCompleted = fullDbTask.motion_completed;
                updatePayload.motionDeadlineType = fullDbTask.motion_deadline_type;
              }
            }
          }
          
          // Update Notion with database state
          await notionClient.updateTask(notionTask.id, updatePayload);
          
          if (notionMotionId && !dbMotionId) {
            // Cleared stale Motion ID
            cleanedCount++;
            results.cleaned.push({
              name: notionTask.name,
              clearedMotionId: notionMotionId
            });
            logger.info(`Cleared stale Motion ID from Notion: ${notionTask.name}`, {
              clearedId: notionMotionId
            });
          } else {
            // Synced correct Motion ID
            syncedCount++;
            results.synced.push({
              name: notionTask.name,
              syncedMotionId: dbMotionId
            });
            logger.info(`Synced correct Motion ID to Notion: ${notionTask.name}`, {
              syncedId: dbMotionId
            });
          }
        }
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        logger.error(`Failed to cleanup Motion ID for task: ${notionTask.name}`, {
          error: error.message
        });
        results.errors.push({
          name: notionTask.name,
          error: error.message
        });
      }
    }
    
    logger.info('Notion Motion ID cleanup completed', {
      cleanedCount,
      syncedCount,
      totalErrors: results.errors.length
    });
    
    res.json({
      success: true,
      message: `Cleaned ${cleanedCount} stale Motion IDs, synced ${syncedCount} correct Motion IDs`,
      results,
      summary: {
        totalTasksChecked: notionTasks.length,
        staleCleaned: cleanedCount,
        correctSynced: syncedCount,
        errors: results.errors.length
      }
    });
    
  } catch (error) {
    logger.error('Notion cleanup failed', { error: error.message });
    res.status(500).json({ 
      error: error.message,
      message: 'Failed to cleanup Notion Motion IDs'
    });
  }
});

// Force full database-to-Notion sync for all tasks
router.post('/force-full-sync', async (req, res) => {
  try {
    logger.info('Starting force full sync - database to Notion');
    
    // Mark ALL tasks as needing Notion sync
    const result = await database.run(`
      UPDATE sync_tasks 
      SET notion_sync_needed = true 
      WHERE notion_page_id IS NOT NULL
    `);
    
    logger.info(`Marked ${result.changes} tasks for forced Notion sync`);
    
    res.json({
      success: true,
      message: `Marked ${result.changes} tasks for forced Notion sync`,
      tasksMarked: result.changes,
      note: 'Next fast sync (within 60 seconds) will push all database state to Notion'
    });
    
  } catch (error) {
    logger.error('Force full sync failed', { error: error.message });
    res.status(500).json({ 
      error: error.message 
    });
  }
});

module.exports = router;