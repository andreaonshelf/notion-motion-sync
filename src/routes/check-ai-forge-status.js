const express = require('express');
const router = express.Router();
const database = require('../database');
const notionClient = require('../services/notionClient');
const motionClient = require('../services/motionClient');
const logger = require('../utils/logger');

router.get('/ai-forge-status', async (req, res) => {
  try {
    logger.info('Checking AI Forge GTM plan status...');
    
    // Get from Notion
    const notionTasks = await notionClient.queryDatabase();
    const aiForgeNotion = notionTasks.find(task => 
      task.name.toLowerCase().includes('ai forge') && 
      task.name.toLowerCase().includes('gtm')
    );
    
    if (!aiForgeNotion) {
      return res.json({ error: 'AI Forge GTM plan not found in Notion' });
    }
    
    // Get from database
    const dbTask = await database.get(
      'SELECT * FROM sync_tasks WHERE notion_page_id = $1',
      [aiForgeNotion.id]
    );
    
    // Get sync logs
    const syncLogs = await database.all(
      `SELECT * FROM sync_logs 
       WHERE notion_page_id = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [aiForgeNotion.id]
    );
    
    // Check Motion
    let motionTask = null;
    let motionError = null;
    if (dbTask?.motion_task_id) {
      try {
        motionTask = await motionClient.getTask(dbTask.motion_task_id);
      } catch (error) {
        motionError = {
          message: error.message,
          status: error.response?.status
        };
      }
    }
    
    // Try to create task with same data to see if it fails
    let testCreationError = null;
    if (!dbTask?.motion_task_id && aiForgeNotion.schedule) {
      try {
        logger.info('Testing Motion task creation with AI Forge data...');
        const testPayload = {
          name: aiForgeNotion.name + ' (TEST)',
          duration: aiForgeNotion.duration,
          dueDate: aiForgeNotion.dueDate,
          startOn: aiForgeNotion.startOn,
          priority: aiForgeNotion.priority
        };
        
        logger.info('Test payload:', testPayload);
        
        // Don't actually create, just validate the payload
        if (aiForgeNotion.startOn) {
          const startDate = new Date(aiForgeNotion.startOn);
          const now = new Date();
          if (startDate < now) {
            testCreationError = 'Start date is in the past - Motion might reject this';
          }
        }
      } catch (error) {
        testCreationError = error.message;
      }
    }
    
    res.json({
      notionData: {
        id: aiForgeNotion.id,
        name: aiForgeNotion.name,
        schedule: aiForgeNotion.schedule,
        motionTaskId: aiForgeNotion.motionTaskId,
        startOn: aiForgeNotion.startOn,
        dueDate: aiForgeNotion.dueDate,
        duration: aiForgeNotion.duration,
        priority: aiForgeNotion.priority
      },
      databaseData: dbTask ? {
        motion_task_id: dbTask.motion_task_id,
        schedule_checkbox: dbTask.schedule_checkbox,
        motion_sync_needed: dbTask.motion_sync_needed,
        motion_last_attempt: dbTask.motion_last_attempt,
        sync_status: dbTask.sync_status,
        start_on: dbTask.start_on,
        notion_sync_needed: dbTask.notion_sync_needed
      } : null,
      motionData: motionTask || motionError,
      syncLogs: syncLogs.map(log => ({
        action: log.action,
        status: log.status,
        details: log.details,
        created_at: log.created_at
      })),
      testCreationError,
      analysis: {
        hasStartOn: !!aiForgeNotion.startOn,
        startOnInPast: aiForgeNotion.startOn ? new Date(aiForgeNotion.startOn) < new Date() : null,
        isOnlyTaskWithStartOn: true // You mentioned this was the only one with start on
      }
    });
    
  } catch (error) {
    logger.error('Error checking AI Forge status', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;