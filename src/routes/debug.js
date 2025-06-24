const express = require('express');
const motionClient = require('../services/motionClient');
const notionClient = require('../services/notionClient');
const logger = require('../utils/logger');

const router = express.Router();

// Test sync one Motion task at a time
router.get('/test-one-motion-task', async (req, res) => {
  try {
    // Get Motion tasks
    const motionResponse = await motionClient.listTasks();
    const motionTasks = motionResponse.tasks || [];
    
    // Get Notion tasks with Motion IDs
    const notionTasks = await notionClient.queryDatabase();
    const notionMotionIds = new Set(
      notionTasks
        .filter(task => task.motionTaskId)
        .map(task => task.motionTaskId)
    );
    
    // Find first Motion task not in Notion
    const missingTask = motionTasks.find(task => !notionMotionIds.has(task.id));
    
    if (!missingTask) {
      return res.json({ message: 'All Motion tasks already in Notion!' });
    }
    
    logger.info('Found Motion task not in Notion', {
      id: missingTask.id,
      name: missingTask.name,
      status: missingTask.status
    });
    
    // Try to create it in Notion
    try {
      const taskData = {
        name: missingTask.name,
        description: missingTask.description || '',
        status: 'Not started',
        priority: 'Medium',
        dueDate: missingTask.dueDate,
        motionTaskId: missingTask.id
      };
      
      logger.info('Attempting to create in Notion', taskData);
      
      const result = await notionClient.createTask(taskData);
      
      res.json({
        success: true,
        motionTask: {
          id: missingTask.id,
          name: missingTask.name
        },
        notionResult: {
          id: result.id,
          url: result.url
        }
      });
    } catch (createError) {
      logger.error('Failed to create in Notion', {
        error: createError.message,
        code: createError.code,
        body: createError.body
      });
      
      res.json({
        success: false,
        motionTask: {
          id: missingTask.id,
          name: missingTask.name
        },
        error: {
          message: createError.message,
          code: createError.code,
          body: createError.body
        }
      });
    }
  } catch (error) {
    logger.error('Test failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;