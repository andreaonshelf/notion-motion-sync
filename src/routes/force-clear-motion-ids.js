const express = require('express');
const router = express.Router();
const notionClient = require('../services/notionClient');
const database = require('../database');
const logger = require('../utils/logger');

// Force clear ALL Motion IDs from Notion when Motion workspace is empty
router.post('/force-clear-all', async (req, res) => {
  try {
    logger.info('Starting FORCE CLEAR of all Motion IDs from Notion');
    
    // Get all tasks from Notion
    const notionTasks = await notionClient.queryDatabase();
    logger.info(`Found ${notionTasks.length} tasks in Notion`);
    
    let clearedCount = 0;
    const results = {
      cleared: [],
      errors: []
    };
    
    // Clear Motion ID from every task that has one
    for (const task of notionTasks) {
      if (task.motionTaskId) {
        try {
          logger.info(`Force clearing Motion ID from: ${task.name}`, {
            motionId: task.motionTaskId
          });
          
          // Clear all Motion fields
          await notionClient.updateTask(task.id, {
            motionTaskId: '',
            motionStartOn: null,
            motionScheduledStart: null,
            motionScheduledEnd: null,
            motionStatus: null,
            motionSchedulingIssue: null,
            motionCompleted: null,
            motionDeadlineType: null
          });
          
          clearedCount++;
          results.cleared.push({
            name: task.name,
            clearedMotionId: task.motionTaskId
          });
          
          // Also update database to clear Motion ID
          await database.run(
            `UPDATE sync_tasks 
             SET motion_task_id = NULL,
                 motion_scheduled_start = NULL,
                 motion_scheduled_end = NULL,
                 motion_status_name = NULL,
                 motion_sync_needed = CASE 
                   WHEN schedule_checkbox = true THEN true 
                   ELSE false 
                 END,
                 notion_sync_needed = false
             WHERE notion_page_id = $1`,
            [task.id]
          );
          
          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (error) {
          logger.error(`Failed to clear Motion ID for: ${task.name}`, {
            error: error.message
          });
          results.errors.push({
            name: task.name,
            error: error.message
          });
        }
      }
    }
    
    logger.info('Force clear completed', {
      clearedCount,
      totalErrors: results.errors.length
    });
    
    res.json({
      success: true,
      message: `Force cleared ${clearedCount} Motion IDs from Notion`,
      results,
      summary: {
        totalTasksChecked: notionTasks.length,
        motionIdsCleared: clearedCount,
        errors: results.errors.length
      },
      note: 'All Motion IDs have been cleared. Tasks marked for scheduling will be recreated in Motion on next sync.'
    });
    
  } catch (error) {
    logger.error('Force clear failed', { error: error.message });
    res.status(500).json({ 
      error: error.message,
      message: 'Failed to force clear Motion IDs'
    });
  }
});

module.exports = router;