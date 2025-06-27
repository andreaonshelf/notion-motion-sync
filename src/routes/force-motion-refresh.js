const express = require('express');
const router = express.Router();
const database = require('../database');
const motionClient = require('../services/motionClient');
const logger = require('../utils/logger');

// Force refresh Motion scheduling data for all tasks
router.post('/refresh-all-scheduling', async (req, res) => {
  try {
    logger.info('Starting forced Motion scheduling data refresh');
    
    // Get all tasks with Motion IDs
    const tasksWithMotionIds = await database.all(`
      SELECT notion_page_id, notion_name, motion_task_id, 
             motion_scheduled_start, motion_scheduled_end
      FROM sync_tasks 
      WHERE motion_task_id IS NOT NULL
      ORDER BY notion_name
    `);
    
    logger.info(`Found ${tasksWithMotionIds.length} tasks with Motion IDs to refresh`);
    
    let refreshedCount = 0;
    let updatedCount = 0;
    const results = {
      refreshed: [],
      errors: []
    };
    
    for (const task of tasksWithMotionIds) {
      try {
        logger.info(`Fetching Motion data for: ${task.notion_name}`, {
          motionId: task.motion_task_id,
          currentScheduledStart: task.motion_scheduled_start || 'none',
          currentScheduledEnd: task.motion_scheduled_end || 'none'
        });
        
        // Fetch fresh data from Motion
        const motionTask = await motionClient.getTask(task.motion_task_id);
        refreshedCount++;
        
        const hadScheduling = !!task.motion_scheduled_start;
        const hasScheduling = !!motionTask.scheduledStart;
        
        // Update database with Motion fields
        await database.updateMotionFields(task.notion_page_id, motionTask);
        
        // Force Notion sync to push the updated data
        await database.run(
          'UPDATE sync_tasks SET notion_sync_needed = true WHERE notion_page_id = $1',
          [task.notion_page_id]
        );
        
        if (!hadScheduling && hasScheduling) {
          updatedCount++;
          logger.info(`NEW scheduling data found for: ${task.notion_name}`, {
            scheduledStart: motionTask.scheduledStart,
            scheduledEnd: motionTask.scheduledEnd
          });
        }
        
        results.refreshed.push({
          name: task.notion_name,
          motionId: task.motion_task_id,
          scheduledStart: motionTask.scheduledStart,
          scheduledEnd: motionTask.scheduledEnd,
          wasUpdated: !hadScheduling && hasScheduling,
          status: motionTask.status
        });
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        logger.error(`Failed to refresh Motion data for: ${task.notion_name}`, {
          error: error.message,
          motionId: task.motion_task_id
        });
        results.errors.push({
          name: task.notion_name,
          error: error.message
        });
      }
    }
    
    logger.info('Motion scheduling refresh completed', {
      totalRefreshed: refreshedCount,
      newSchedulingFound: updatedCount
    });
    
    res.json({
      success: true,
      message: `Refreshed ${refreshedCount} tasks, found ${updatedCount} with new scheduling data`,
      results,
      summary: {
        totalTasks: tasksWithMotionIds.length,
        successfullyRefreshed: refreshedCount,
        newSchedulingDataFound: updatedCount,
        errors: results.errors.length
      },
      note: 'Notion will be updated in the next fast sync (within 60 seconds)'
    });
    
  } catch (error) {
    logger.error('Force refresh failed', { error: error.message });
    res.status(500).json({ 
      error: error.message,
      message: 'Failed to refresh Motion scheduling data'
    });
  }
});

// Check specific tasks missing scheduling data
router.get('/missing-schedules', async (req, res) => {
  try {
    const tasksWithoutScheduling = await database.all(`
      SELECT notion_page_id, notion_name, motion_task_id,
             motion_scheduled_start, motion_scheduled_end,
             created_at, updated_at, motion_sync_needed, notion_sync_needed
      FROM sync_tasks 
      WHERE motion_task_id IS NOT NULL 
      AND motion_scheduled_start IS NULL
      AND schedule_checkbox = true
      ORDER BY notion_name
    `);
    
    res.json({
      totalMissingSchedules: tasksWithoutScheduling.length,
      tasks: tasksWithoutScheduling.map(task => ({
        name: task.notion_name,
        motionId: task.motion_task_id,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        syncFlags: {
          motionSyncNeeded: task.motion_sync_needed,
          notionSyncNeeded: task.notion_sync_needed
        }
      }))
    });
    
  } catch (error) {
    logger.error('Failed to check missing schedules', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;