const express = require('express');
const router = express.Router();
const database = require('../database');
const motionClient = require('../services/motionClient');
const logger = require('../utils/logger');

// Diagnostic endpoint to check Motion fields in database
router.get('/diagnostic/motion-fields', async (req, res) => {
  try {
    logger.info('Running Motion fields diagnostic');
    
    // 1. Get all tasks with Motion IDs
    const tasksWithMotionIds = await database.all(`
      SELECT 
        notion_page_id,
        notion_name,
        motion_task_id,
        motion_sync_needed,
        notion_sync_needed,
        motion_start_on,
        motion_scheduled_start,
        motion_scheduled_end,
        motion_status_name,
        motion_scheduling_issue,
        motion_completed,
        motion_deadline_type,
        motion_updated_time,
        schedule_checkbox,
        updated_at
      FROM sync_tasks
      WHERE motion_task_id IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 10
    `);
    
    // 2. Get tasks that need Notion sync
    const tasksNeedingNotionSync = await database.all(`
      SELECT 
        notion_page_id,
        notion_name,
        motion_task_id,
        notion_sync_needed,
        motion_scheduled_start,
        motion_scheduled_end,
        motion_status_name
      FROM sync_tasks
      WHERE notion_sync_needed = true
      LIMIT 10
    `);
    
    // 3. Get scheduled tasks without Motion fields
    const scheduledTasksNoMotionFields = await database.all(`
      SELECT 
        notion_page_id,
        notion_name,
        motion_task_id,
        schedule_checkbox,
        motion_scheduled_start,
        motion_scheduled_end
      FROM sync_tasks
      WHERE schedule_checkbox = true
        AND motion_task_id IS NOT NULL
        AND (motion_scheduled_start IS NULL OR motion_scheduled_end IS NULL)
      LIMIT 10
    `);
    
    // 4. Sample a task with Motion ID and fetch fresh data from Motion
    let motionApiSample = null;
    if (tasksWithMotionIds.length > 0 && tasksWithMotionIds[0].motion_task_id) {
      try {
        const motionTask = await motionClient.getTask(tasksWithMotionIds[0].motion_task_id);
        motionApiSample = {
          notionName: tasksWithMotionIds[0].notion_name,
          motionId: tasksWithMotionIds[0].motion_task_id,
          dbFields: {
            scheduledStart: tasksWithMotionIds[0].motion_scheduled_start,
            scheduledEnd: tasksWithMotionIds[0].motion_scheduled_end,
            status: tasksWithMotionIds[0].motion_status_name
          },
          motionApiResponse: {
            id: motionTask.id,
            name: motionTask.name,
            scheduledStart: motionTask.scheduledStart,
            scheduledEnd: motionTask.scheduledEnd,
            status: motionTask.status,
            startOn: motionTask.startOn,
            deadlineType: motionTask.deadlineType,
            schedulingIssue: motionTask.schedulingIssue
          }
        };
      } catch (error) {
        motionApiSample = {
          error: `Failed to fetch from Motion API: ${error.message}`
        };
      }
    }
    
    // 5. Check recent sync activity
    const recentSyncActivity = await database.all(`
      SELECT 
        action,
        created_at,
        notion_page_id,
        motion_task_id,
        error
      FROM sync_history
      WHERE created_at > NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC
      LIMIT 20
    `);
    
    // 6. Summary statistics
    const stats = await database.get(`
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(motion_task_id) as tasks_with_motion_id,
        COUNT(CASE WHEN notion_sync_needed = true THEN 1 END) as pending_notion_updates,
        COUNT(CASE WHEN motion_sync_needed = true THEN 1 END) as pending_motion_operations,
        COUNT(CASE WHEN schedule_checkbox = true THEN 1 END) as scheduled_tasks,
        COUNT(CASE WHEN schedule_checkbox = true AND motion_task_id IS NOT NULL THEN 1 END) as scheduled_with_motion,
        COUNT(CASE WHEN motion_scheduled_start IS NOT NULL THEN 1 END) as tasks_with_scheduled_start,
        COUNT(CASE WHEN motion_scheduled_end IS NOT NULL THEN 1 END) as tasks_with_scheduled_end
      FROM sync_tasks
    `);
    
    const response = {
      summary: {
        totalTasks: stats.total_tasks,
        tasksWithMotionId: stats.tasks_with_motion_id,
        pendingNotionUpdates: stats.pending_notion_updates,
        pendingMotionOperations: stats.pending_motion_operations,
        scheduledTasks: stats.scheduled_tasks,
        scheduledWithMotion: stats.scheduled_with_motion,
        tasksWithScheduledStart: stats.tasks_with_scheduled_start,
        tasksWithScheduledEnd: stats.tasks_with_scheduled_end
      },
      tasksWithMotionIds: tasksWithMotionIds.map(task => ({
        notionName: task.notion_name,
        motionId: task.motion_task_id,
        motionSyncNeeded: task.motion_sync_needed,
        notionSyncNeeded: task.notion_sync_needed,
        motionFields: {
          startOn: task.motion_start_on,
          scheduledStart: task.motion_scheduled_start,
          scheduledEnd: task.motion_scheduled_end,
          status: task.motion_status_name,
          schedulingIssue: task.motion_scheduling_issue,
          completed: task.motion_completed,
          deadlineType: task.motion_deadline_type
        },
        updatedAt: task.updated_at
      })),
      tasksNeedingNotionSync,
      scheduledTasksNoMotionFields,
      motionApiSample,
      recentSyncActivity: recentSyncActivity.map(activity => ({
        action: activity.action,
        time: activity.created_at,
        notionPageId: activity.notion_page_id,
        motionTaskId: activity.motion_task_id,
        error: activity.error
      }))
    };
    
    res.json(response);
    
  } catch (error) {
    logger.error('Error in motion fields diagnostic', { error: error.message });
    res.status(500).json({ 
      error: 'Failed to run diagnostic',
      details: error.message 
    });
  }
});

// Force update Motion fields for a specific task
router.post('/diagnostic/motion-fields/refresh/:notionPageId', async (req, res) => {
  try {
    const { notionPageId } = req.params;
    
    // Get the task from database
    const task = await database.getMappingByNotionId(notionPageId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found in database' });
    }
    
    if (!task.motion_task_id) {
      return res.status(400).json({ error: 'Task has no Motion ID' });
    }
    
    // Fetch fresh data from Motion API
    const motionTask = await motionClient.getTask(task.motion_task_id);
    
    // Update Motion fields in database
    await database.updateMotionFields(notionPageId, motionTask);
    
    // Mark for Notion sync
    await database.markNotionSyncNeeded(notionPageId);
    
    res.json({
      success: true,
      notionPageId,
      motionTaskId: task.motion_task_id,
      updatedFields: {
        scheduledStart: motionTask.scheduledStart,
        scheduledEnd: motionTask.scheduledEnd,
        status: motionTask.status?.name,
        startOn: motionTask.startOn,
        schedulingIssue: motionTask.schedulingIssue,
        completed: motionTask.completed,
        deadlineType: motionTask.deadlineType
      }
    });
    
  } catch (error) {
    logger.error('Error refreshing Motion fields', { error: error.message });
    res.status(500).json({ 
      error: 'Failed to refresh Motion fields',
      details: error.message 
    });
  }
});

module.exports = router;