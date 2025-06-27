const express = require('express');
const motionClient = require('../services/motionClient');
const logger = require('../utils/logger');

const router = express.Router();

// Debug what Motion API returns for a specific task
router.get('/task/:motionTaskId', async (req, res) => {
  try {
    const { motionTaskId } = req.params;
    
    logger.info(`Fetching Motion task details for: ${motionTaskId}`);
    
    const motionTask = await motionClient.getTask(motionTaskId);
    
    res.json({
      motionTaskId,
      rawResponse: motionTask,
      extractedFields: {
        id: motionTask.id,
        name: motionTask.name,
        scheduledStart: motionTask.scheduledStart,
        scheduledEnd: motionTask.scheduledEnd,
        startOn: motionTask.startOn,
        status: motionTask.status,
        completed: motionTask.completed,
        schedulingIssue: motionTask.schedulingIssue,
        deadlineType: motionTask.deadlineType,
        updatedTime: motionTask.updatedTime
      }
    });
    
  } catch (error) {
    logger.error(`Error fetching Motion task ${req.params.motionTaskId}`, { 
      error: error.message,
      status: error.response?.status,
      data: error.response?.data 
    });
    res.status(500).json({ 
      error: error.message,
      motionTaskId: req.params.motionTaskId
    });
  }
});

// List all Motion tasks to see what's available
router.get('/list-all', async (req, res) => {
  try {
    logger.info('Fetching all Motion tasks');
    
    const response = await motionClient.listTasks();
    const tasks = response.tasks || [];
    
    res.json({
      totalTasks: tasks.length,
      tasks: tasks.map(task => ({
        id: task.id,
        name: task.name,
        scheduledStart: task.scheduledStart,
        scheduledEnd: task.scheduledEnd,
        startOn: task.startOn,
        status: task.status?.name,
        completed: task.completed,
        createdTime: task.createdTime,
        updatedTime: task.updatedTime
      }))
    });
    
  } catch (error) {
    logger.error('Error listing Motion tasks', { 
      error: error.message,
      status: error.response?.status,
      data: error.response?.data 
    });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;