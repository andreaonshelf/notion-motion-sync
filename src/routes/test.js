const express = require('express');
const axios = require('axios');
const { config } = require('../config');
const logger = require('../utils/logger');
const syncService = require('../services/syncService');
const motionClient = require('../services/motionClient');
const notionClient = require('../services/notionClient');

const router = express.Router();

router.get('/motion-direct', async (req, res) => {
  try {
    const apiKey = config.motion.apiKey;
    const url = `${config.motion.apiUrl}/tasks`;
    
    logger.info('Direct Motion API test', {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      apiKeyPreview: apiKey ? apiKey.substring(0, 10) + '...' : 'MISSING',
      url: url
    });
    
    const response = await axios.get(url, {
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    res.json({
      success: true,
      taskCount: response.data.tasks ? response.data.tasks.length : 0,
      data: response.data
    });
  } catch (error) {
    logger.error('Direct Motion API test failed', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    
    res.status(500).json({
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
});

// Manual sync test for a specific Motion task
router.post('/sync-single-motion-task', async (req, res) => {
  try {
    const { taskId } = req.body;
    
    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }
    
    logger.info('Manual sync test for Motion task', { taskId });
    
    // First, get the Motion task details
    const motionTask = await motionClient.getTask(taskId);
    logger.info('Motion task details', {
      id: motionTask.id,
      name: motionTask.name,
      status: motionTask.status,
      description: motionTask.description?.substring(0, 100)
    });
    
    // Check if it already exists in Notion
    const existingNotionTasks = await notionClient.queryDatabase({
      property: 'Motion Task ID',
      rich_text: {
        equals: taskId
      }
    });
    
    logger.info('Existing Notion tasks check', {
      found: existingNotionTasks.length,
      ids: existingNotionTasks.map(t => t.id)
    });
    
    // Try to sync it
    await syncService.syncMotionToNotion(taskId);
    
    // Check again after sync
    const afterSyncCheck = await notionClient.queryDatabase({
      property: 'Motion Task ID',
      rich_text: {
        equals: taskId
      }
    });
    
    res.json({
      success: true,
      motionTask: {
        id: motionTask.id,
        name: motionTask.name,
        status: motionTask.status
      },
      existingInNotion: existingNotionTasks.length > 0,
      afterSync: {
        found: afterSyncCheck.length,
        tasks: afterSyncCheck.map(t => ({
          id: t.id,
          name: t.name,
          motionTaskId: t.motionTaskId
        }))
      }
    });
  } catch (error) {
    logger.error('Single task sync test failed', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: error.message,
      details: error.response?.data || error.stack
    });
  }
});

// Test creating a task in Notion directly
router.post('/test-notion-create', async (req, res) => {
  try {
    const testTask = {
      name: 'Test Motion Task from API',
      description: 'This is a test task created directly',
      status: 'Not started',
      priority: 'Medium',
      dueDate: null,
      motionTaskId: 'test-motion-id-123'
    };
    
    logger.info('Testing direct Notion task creation', testTask);
    
    const result = await notionClient.createTask(testTask);
    
    res.json({
      success: true,
      notionTaskId: result.id,
      url: result.url
    });
  } catch (error) {
    logger.error('Notion create test failed', {
      error: error.message,
      response: error.response?.data
    });
    
    res.status(500).json({
      error: error.message,
      details: error.response?.data || error
    });
  }
});

module.exports = router;