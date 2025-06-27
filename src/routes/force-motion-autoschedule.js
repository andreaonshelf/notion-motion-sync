const express = require('express');
const router = express.Router();
const axios = require('axios');
const database = require('../database');
const motionClient = require('../services/motionClient');
const logger = require('../utils/logger');

// Force Motion to auto-schedule all unscheduled tasks
router.post('/trigger-autoschedule', async (req, res) => {
  try {
    logger.info('Triggering Motion auto-schedule for all tasks');
    
    const apiKey = process.env.MOTION_API_KEY;
    const workspaceId = process.env.MOTION_WORKSPACE_ID;
    
    // First, get all tasks from Motion
    const tasksResponse = await motionClient.listTasks();
    const tasks = tasksResponse.tasks || [];
    
    logger.info(`Found ${tasks.length} tasks in Motion`);
    
    let triggeredCount = 0;
    let alreadyScheduledCount = 0;
    const results = {
      triggered: [],
      alreadyScheduled: [],
      errors: []
    };
    
    for (const task of tasks) {
      try {
        // Check if task is already scheduled
        if (task.scheduledStart && task.scheduledEnd) {
          alreadyScheduledCount++;
          results.alreadyScheduled.push({
            name: task.name,
            scheduledStart: task.scheduledStart,
            scheduledEnd: task.scheduledEnd
          });
          continue;
        }
        
        logger.info(`Triggering auto-schedule for: ${task.name}`, {
          taskId: task.id,
          currentStatus: task.status
        });
        
        // Motion API endpoint to trigger auto-scheduling
        // This updates the task with autoScheduled: true
        const response = await axios.patch(
          `https://api.usemotion.com/v1/tasks/${task.id}`,
          {
            autoScheduled: {
              startDate: new Date().toISOString().split('T')[0], // Today
              deadlineType: 'HARD',
              schedule: 'WORK_HOURS'
            }
          },
          {
            headers: {
              'X-API-Key': apiKey,
              'Content-Type': 'application/json'
            }
          }
        );
        
        triggeredCount++;
        results.triggered.push({
          name: task.name,
          taskId: task.id,
          response: response.data
        });
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        logger.error(`Failed to trigger auto-schedule for: ${task.name}`, {
          error: error.message,
          status: error.response?.status,
          data: error.response?.data
        });
        results.errors.push({
          name: task.name,
          error: error.message,
          status: error.response?.status
        });
      }
    }
    
    // Mark all tasks for scheduling refresh in database
    await database.run(`
      UPDATE sync_tasks 
      SET needs_scheduling_refresh = true,
          notion_sync_needed = true
      WHERE motion_task_id IS NOT NULL
    `);
    
    logger.info('Auto-schedule trigger completed', {
      totalTasks: tasks.length,
      triggered: triggeredCount,
      alreadyScheduled: alreadyScheduledCount,
      errors: results.errors.length
    });
    
    res.json({
      success: true,
      message: `Triggered auto-schedule for ${triggeredCount} tasks`,
      summary: {
        totalTasks: tasks.length,
        triggered: triggeredCount,
        alreadyScheduled: alreadyScheduledCount,
        errors: results.errors.length
      },
      results,
      note: 'Motion will schedule tasks asynchronously. Check back in 1-2 minutes for scheduling data.'
    });
    
  } catch (error) {
    logger.error('Failed to trigger auto-schedule', { error: error.message });
    res.status(500).json({ 
      error: error.message,
      message: 'Failed to trigger Motion auto-schedule'
    });
  }
});

// Alternative: Force schedule using Motion's schedule assistant
router.post('/schedule-assistant', async (req, res) => {
  try {
    logger.info('Triggering Motion Schedule Assistant');
    
    const apiKey = process.env.MOTION_API_KEY;
    
    // This endpoint triggers Motion's AI scheduling assistant
    const response = await axios.post(
      'https://api.usemotion.com/v1/schedule/assistant/run',
      {
        workspaceId: process.env.MOTION_WORKSPACE_ID,
        options: {
          respectExistingSchedule: true,
          scheduleType: 'OPTIMIZE' // or 'FILL_GAPS'
        }
      },
      {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    res.json({
      success: true,
      message: 'Motion Schedule Assistant triggered',
      response: response.data
    });
    
  } catch (error) {
    logger.error('Failed to trigger schedule assistant', { 
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    res.status(500).json({ 
      error: error.message,
      status: error.response?.status,
      details: error.response?.data
    });
  }
});

module.exports = router;