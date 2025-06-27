const express = require('express');
const router = express.Router();
const motionClient = require('../services/motionClient');
const logger = require('../utils/logger');

// Check what Motion API actually returns
router.get('/list-all', async (req, res) => {
  try {
    logger.info('Checking Motion tasks...');
    
    const response = await motionClient.listTasks();
    const tasks = response.tasks || [];
    
    logger.info(`Motion API returned ${tasks.length} tasks`);
    
    const taskSummary = tasks.map(task => ({
      id: task.id,
      name: task.name,
      status: task.status,
      workspaceId: task.workspaceId,
      createdTime: task.createdTime,
      scheduledStart: task.scheduledStart,
      scheduledEnd: task.scheduledEnd
    }));
    
    res.json({
      success: true,
      totalTasks: tasks.length,
      workspaceId: process.env.MOTION_WORKSPACE_ID,
      tasks: taskSummary,
      motionApiKeyConfigured: !!process.env.MOTION_API_KEY,
      apiKeyPreview: process.env.MOTION_API_KEY ? process.env.MOTION_API_KEY.substring(0, 10) + '...' : 'missing'
    });
    
  } catch (error) {
    logger.error('Failed to check Motion tasks', { 
      error: error.message,
      statusCode: error.response?.status,
      responseData: error.response?.data
    });
    res.status(500).json({ 
      error: error.message,
      statusCode: error.response?.status,
      responseData: error.response?.data
    });
  }
});

module.exports = router;