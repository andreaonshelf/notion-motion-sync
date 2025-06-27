const express = require('express');
const router = express.Router();
const motionClient = require('../services/motionClient');
const database = require('../database');
const logger = require('../utils/logger');

// Force schedule by updating task properties that trigger Motion's scheduler
router.post('/force-schedule', async (req, res) => {
  try {
    logger.info('Attempting to force Motion scheduling through task updates');
    
    // Get all tasks from Motion
    const tasksResponse = await motionClient.listTasks();
    const tasks = tasksResponse.tasks || [];
    
    let processedCount = 0;
    let scheduledCount = 0;
    const results = {
      processed: [],
      errors: []
    };
    
    for (const task of tasks) {
      try {
        logger.info(`Processing task: ${task.name}`, {
          taskId: task.id,
          hasScheduling: !!(task.scheduledStart && task.scheduledEnd),
          status: task.status
        });
        
        // Check if already scheduled
        if (task.scheduledStart && task.scheduledEnd) {
          scheduledCount++;
          results.processed.push({
            name: task.name,
            status: 'already_scheduled',
            scheduledStart: task.scheduledStart,
            scheduledEnd: task.scheduledEnd
          });
          continue;
        }
        
        // Try different approaches to trigger scheduling
        
        // Approach 1: Update with deadline to force scheduling
        const updatePayload = {
          // Motion often schedules tasks when they have deadlines
          dueDate: task.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
          // Ensure it's marked as auto-schedulable
          status: task.status || 'Todo'
        };
        
        // Add priority if not set (helps with scheduling)
        if (!task.priority) {
          updatePayload.priority = 'MEDIUM';
        }
        
        logger.info(`Updating task to trigger scheduling: ${task.name}`, {
          updatePayload
        });
        
        await motionClient.updateTask(task.id, updatePayload);
        
        processedCount++;
        results.processed.push({
          name: task.name,
          status: 'updated_to_trigger_scheduling',
          updatePayload
        });
        
        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        logger.error(`Failed to process task: ${task.name}`, {
          error: error.message
        });
        results.errors.push({
          name: task.name,
          error: error.message
        });
      }
    }
    
    // Wait a moment then refresh scheduling data
    setTimeout(async () => {
      try {
        logger.info('Refreshing Motion scheduling data after updates...');
        
        for (const task of tasks) {
          try {
            const updatedTask = await motionClient.getTask(task.id);
            if (updatedTask.scheduledStart || updatedTask.scheduledEnd) {
              // Update database with new scheduling
              await database.updateMotionFields(task.id, updatedTask);
              // Mark for Notion sync
              await database.run(
                'UPDATE sync_tasks SET notion_sync_needed = true WHERE motion_task_id = $1',
                [task.id]
              );
            }
          } catch (error) {
            logger.warn(`Failed to refresh task: ${task.name}`, { error: error.message });
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        logger.error('Failed to refresh scheduling data', { error: error.message });
      }
    }, 10000); // Wait 10 seconds before refreshing
    
    res.json({
      success: true,
      message: `Processed ${processedCount} tasks to trigger scheduling`,
      summary: {
        totalTasks: tasks.length,
        processed: processedCount,
        alreadyScheduled: scheduledCount,
        errors: results.errors.length
      },
      results,
      note: 'Motion may take 1-2 minutes to schedule tasks. Scheduling data will be refreshed automatically.'
    });
    
  } catch (error) {
    logger.error('Failed to force scheduling', { error: error.message });
    res.status(500).json({ 
      error: error.message
    });
  }
});

// Check current scheduling status
router.get('/status', async (req, res) => {
  try {
    const tasksResponse = await motionClient.listTasks();
    const tasks = tasksResponse.tasks || [];
    
    const summary = {
      total: tasks.length,
      scheduled: 0,
      unscheduled: 0,
      tasks: []
    };
    
    for (const task of tasks) {
      const isScheduled = !!(task.scheduledStart && task.scheduledEnd);
      
      if (isScheduled) {
        summary.scheduled++;
      } else {
        summary.unscheduled++;
      }
      
      summary.tasks.push({
        name: task.name,
        id: task.id,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        duration: task.duration,
        isScheduled,
        scheduledStart: task.scheduledStart,
        scheduledEnd: task.scheduledEnd
      });
    }
    
    res.json(summary);
    
  } catch (error) {
    logger.error('Failed to get scheduling status', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;