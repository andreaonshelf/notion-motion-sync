const express = require('express');
const database = require('../database');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/scheduled-tasks-state', async (req, res) => {
  try {
    // Get all scheduled tasks with their sync state
    const scheduledTasks = await database.all(`
      SELECT 
        notion_page_id,
        notion_name,
        motion_task_id,
        schedule_checkbox,
        motion_sync_needed,
        motion_priority,
        motion_last_attempt,
        sync_status,
        error_message,
        error_count,
        notion_last_edited,
        motion_last_synced,
        updated_at
      FROM sync_tasks 
      WHERE schedule_checkbox = true
      ORDER BY notion_name
    `);
    
    // Get tasks that would be picked up by getMotionTasksToProcess
    const tasksForSlowSync = await database.getMotionTasksToProcess(100);
    
    // Check the detectMotionSyncNeeds conditions
    const tasksNeedingDetection = await database.all(`
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
    
    res.json({
      scheduledTasksCount: scheduledTasks.length,
      scheduledTasks: scheduledTasks.map(t => ({
        name: t.notion_name,
        motionId: t.motion_task_id,
        syncNeeded: t.motion_sync_needed,
        syncStatus: t.sync_status,
        lastAttempt: t.motion_last_attempt,
        errorCount: t.error_count,
        errorMessage: t.error_message
      })),
      tasksForSlowSyncCount: tasksForSlowSync.length,
      tasksForSlowSync: tasksForSlowSync.map(t => t.notion_name),
      tasksNeedingDetectionCount: tasksNeedingDetection.length,
      tasksNeedingDetection: tasksNeedingDetection.map(t => ({
        name: t.notion_name,
        motionId: t.motion_task_id,
        syncNeeded: t.motion_sync_needed
      }))
    });
  } catch (error) {
    logger.error('Error in scheduled tasks state', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;