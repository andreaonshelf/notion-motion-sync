const express = require('express');
const database = require('../database');
const pollService = require('../services/pollService');
const logger = require('../utils/logger');

const router = express.Router();

// Manually trigger detectMotionSyncNeeds
router.post('/manual-detect-sync', async (req, res) => {
  try {
    logger.info('MANUAL: Running detectMotionSyncNeeds...');
    
    // Run the SQL detection
    await database.detectMotionSyncNeeds();
    
    // Get tasks that need Motion sync
    const tasksNeedingSync = await database.getMotionTasksToProcess(100);
    
    // Get scheduled tasks for comparison
    const scheduledTasks = await database.all(
      'SELECT * FROM sync_tasks WHERE schedule_checkbox = true'
    );
    
    res.json({
      success: true,
      scheduledTasksCount: scheduledTasks.length,
      tasksNeedingMotionSync: tasksNeedingSync.length,
      scheduledTasks: scheduledTasks.map(t => ({
        name: t.notion_name,
        has_motion_id: !!t.motion_task_id,
        motion_sync_needed: t.motion_sync_needed,
        motion_last_attempt: t.motion_last_attempt,
        notion_page_id: t.notion_page_id
      })),
      tasksToSync: tasksNeedingSync.map(t => ({
        name: t.notion_name,
        motion_task_id: t.motion_task_id,
        priority: t.priority
      }))
    });
  } catch (error) {
    logger.error('MANUAL: Error in manual detect sync', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Manually process one Motion task
router.post('/manual-process-task/:notionPageId', async (req, res) => {
  try {
    const { notionPageId } = req.params;
    
    logger.info('MANUAL: Processing single task', { notionPageId });
    
    // Get the task
    const task = await database.getMappingByNotionId(notionPageId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Process it
    await pollService.processMotionTask(task);
    
    res.json({
      success: true,
      task: {
        name: task.notion_name,
        motion_task_id: task.motion_task_id
      }
    });
  } catch (error) {
    logger.error('MANUAL: Error processing task', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;