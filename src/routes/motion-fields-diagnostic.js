const express = require('express');
const database = require('../database');
const motionClient = require('../services/motionClient');
const notionClient = require('../services/notionClient');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/motion-fields', async (req, res) => {
  try {
    // Get all tasks with Motion IDs to check their Motion fields
    const tasksWithMotion = await database.all(`
      SELECT 
        notion_page_id,
        notion_name,
        motion_task_id,
        motion_start_on,
        motion_scheduled_start,
        motion_scheduled_end,
        motion_status_name,
        motion_scheduling_issue,
        motion_completed,
        motion_deadline_type,
        motion_updated_time,
        notion_sync_needed,
        schedule_checkbox
      FROM sync_tasks 
      WHERE motion_task_id IS NOT NULL
      ORDER BY notion_name
    `);
    
    // Count tasks with actual Motion field values
    const tasksWithScheduling = tasksWithMotion.filter(t => 
      t.motion_scheduled_start || t.motion_scheduled_end
    );
    
    // Get tasks pending Notion sync
    const pendingNotionSync = await database.all(`
      SELECT notion_page_id, notion_name, motion_task_id
      FROM sync_tasks 
      WHERE notion_sync_needed = true
    `);
    
    // Sample one task to show all Motion fields from API
    let sampleMotionData = null;
    if (tasksWithMotion.length > 0 && tasksWithMotion[0].motion_task_id) {
      try {
        sampleMotionData = await motionClient.getTask(tasksWithMotion[0].motion_task_id);
      } catch (error) {
        sampleMotionData = { error: error.message };
      }
    }
    
    res.json({
      summary: {
        totalTasksWithMotionId: tasksWithMotion.length,
        tasksWithSchedulingData: tasksWithScheduling.length,
        tasksPendingNotionSync: pendingNotionSync.length
      },
      tasksWithMotionFields: tasksWithMotion.map(t => ({
        name: t.notion_name,
        motionId: t.motion_task_id,
        scheduled: t.schedule_checkbox,
        motionFields: {
          startOn: t.motion_start_on,
          scheduledStart: t.motion_scheduled_start,
          scheduledEnd: t.motion_scheduled_end,
          status: t.motion_status_name,
          schedulingIssue: t.motion_scheduling_issue,
          completed: t.motion_completed,
          deadlineType: t.motion_deadline_type,
          updatedTime: t.motion_updated_time
        },
        notionSyncNeeded: t.notion_sync_needed
      })),
      pendingNotionSync: pendingNotionSync.map(t => ({
        pageId: t.notion_page_id,
        name: t.notion_name,
        motionId: t.motion_task_id
      })),
      sampleMotionApiResponse: sampleMotionData
    });
  } catch (error) {
    logger.error('Error in motion fields diagnostic', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Force refresh Motion fields for a specific task
router.post('/motion-fields/refresh/:notionPageId', async (req, res) => {
  try {
    const { notionPageId } = req.params;
    
    // Get task from database
    const task = await database.get(
      'SELECT * FROM sync_tasks WHERE notion_page_id = $1',
      [notionPageId]
    );
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    if (!task.motion_task_id) {
      return res.status(400).json({ error: 'Task has no Motion ID' });
    }
    
    // Fetch fresh data from Motion
    const motionTask = await motionClient.getTask(task.motion_task_id);
    
    // Update database with Motion fields
    await database.updateMotionFields(notionPageId, motionTask);
    
    // Get updated task
    const updatedTask = await database.get(
      'SELECT * FROM sync_tasks WHERE notion_page_id = $1',
      [notionPageId]
    );
    
    res.json({
      taskName: task.notion_name,
      motionId: task.motion_task_id,
      motionApiData: {
        scheduledStart: motionTask.scheduledStart,
        scheduledEnd: motionTask.scheduledEnd,
        status: motionTask.status,
        completed: motionTask.completed,
        schedulingIssue: motionTask.schedulingIssue
      },
      databaseAfterUpdate: {
        motion_scheduled_start: updatedTask.motion_scheduled_start,
        motion_scheduled_end: updatedTask.motion_scheduled_end,
        motion_status_name: updatedTask.motion_status_name,
        motion_completed: updatedTask.motion_completed,
        notion_sync_needed: updatedTask.notion_sync_needed
      }
    });
  } catch (error) {
    logger.error('Error refreshing Motion fields', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;