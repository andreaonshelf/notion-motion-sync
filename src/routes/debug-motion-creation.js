const express = require('express');
const router = express.Router();
const database = require('../database');
const motionClient = require('../services/motionClient');
const logger = require('../utils/logger');

// Manually test Motion task creation to see exact errors
router.post('/test-create', async (req, res) => {
  try {
    logger.info('Testing Motion task creation manually...');
    
    // Get one scheduled task from database
    const testTask = await database.get(`
      SELECT * FROM sync_tasks 
      WHERE schedule_checkbox = true 
      AND motion_task_id IS NULL
      LIMIT 1
    `);
    
    if (!testTask) {
      return res.json({ error: 'No scheduled tasks without Motion ID found' });
    }
    
    logger.info('Found test task', { taskName: testTask.notion_name });
    
    // Try to create Motion task with same data as sync process
    const motionTaskData = {
      name: testTask.notion_name,
      duration: testTask.duration,
      dueDate: testTask.due_date,
      startOn: testTask.start_on,
      status: 'Not started',
      priority: testTask.priority
    };
    
    logger.info('Attempting Motion task creation with payload', { motionTaskData });
    
    try {
      const result = await motionClient.createTask(motionTaskData);
      
      res.json({
        success: true,
        message: 'Motion task created successfully',
        testTask: {
          name: testTask.notion_name,
          payload: motionTaskData,
          result: result
        }
      });
      
    } catch (motionError) {
      logger.error('Motion task creation failed', {
        error: motionError.message,
        status: motionError.response?.status,
        statusText: motionError.response?.statusText,
        data: motionError.response?.data,
        headers: motionError.response?.headers
      });
      
      res.json({
        success: false,
        message: 'Motion task creation failed',
        testTask: {
          name: testTask.notion_name,
          payload: motionTaskData
        },
        error: {
          message: motionError.message,
          status: motionError.response?.status,
          statusText: motionError.response?.statusText,
          data: motionError.response?.data,
          config: motionError.config
        }
      });
    }
    
  } catch (error) {
    logger.error('Test creation failed', { error: error.message });
    res.status(500).json({ 
      error: error.message,
      message: 'Failed to test Motion task creation'
    });
  }
});

module.exports = router;