const express = require('express');
const database = require('../database');
const motionClient = require('../services/motionClient');
const logger = require('../utils/logger');

const router = express.Router();

// Refresh all Motion fields for tasks with Motion IDs
router.post('/refresh-all', async (req, res) => {
  try {
    logger.info('Starting Motion fields refresh for all tasks');
    
    // Get all tasks with Motion IDs
    const tasksWithMotionIds = await database.all(
      'SELECT notion_page_id, notion_name, motion_task_id FROM sync_tasks WHERE motion_task_id IS NOT NULL'
    );
    
    logger.info(`Found ${tasksWithMotionIds.length} tasks with Motion IDs to refresh`);
    
    const results = {
      success: [],
      failed: [],
      notFound: []
    };
    
    for (const task of tasksWithMotionIds) {
      try {
        // Fetch full details from Motion
        const motionTask = await motionClient.getTask(task.motion_task_id);
        
        // Update Motion fields in database
        await database.updateMotionFields(task.notion_page_id, motionTask);
        
        results.success.push({
          name: task.notion_name,
          motionId: task.motion_task_id,
          scheduledStart: motionTask.scheduledStart,
          scheduledEnd: motionTask.scheduledEnd,
          status: motionTask.status?.name
        });
        
        logger.info(`Refreshed Motion fields for: ${task.notion_name}`);
        
      } catch (error) {
        if (error.response?.status === 404) {
          results.notFound.push({
            name: task.notion_name,
            motionId: task.motion_task_id
          });
        } else {
          results.failed.push({
            name: task.notion_name,
            motionId: task.motion_task_id,
            error: error.message
          });
        }
      }
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Trigger fast sync to push to Notion
    const pollService = require('../services/pollService');
    await pollService.fastSync();
    
    res.json({
      message: 'Motion fields refresh complete',
      totalTasks: tasksWithMotionIds.length,
      results
    });
    
  } catch (error) {
    logger.error('Error refreshing Motion fields', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;