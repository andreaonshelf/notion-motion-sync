const express = require('express');
const database = require('../database');
const motionClient = require('../services/motionClient');
const logger = require('../utils/logger');

const router = express.Router();

// Test the complete Motion fields flow
router.post('/test-flow/:motionTaskId', async (req, res) => {
  try {
    const { motionTaskId } = req.params;
    
    logger.info('TEST: Starting Motion fields flow test', { motionTaskId });
    
    // Step 1: Fetch Motion task
    logger.info('TEST: Fetching Motion task from API');
    const motionTask = await motionClient.getTask(motionTaskId);
    
    logger.info('TEST: Motion API response', {
      id: motionTask.id,
      scheduledStart: motionTask.scheduledStart,
      scheduledEnd: motionTask.scheduledEnd,
      status: motionTask.status,
      startOn: motionTask.startOn
    });
    
    // Step 2: Check if updateMotionFields exists
    if (!database.updateMotionFields) {
      return res.json({
        error: 'updateMotionFields method not found in database module',
        hint: 'The new code may not be deployed yet'
      });
    }
    
    // Step 3: Find a task with this Motion ID
    const dbTask = await database.get(
      'SELECT notion_page_id, notion_name FROM sync_tasks WHERE motion_task_id = $1',
      [motionTaskId]
    );
    
    if (!dbTask) {
      return res.json({
        error: 'No task found in database with this Motion ID',
        motionTaskId
      });
    }
    
    // Step 4: Update Motion fields
    logger.info('TEST: Calling updateMotionFields');
    await database.updateMotionFields(dbTask.notion_page_id, motionTask);
    
    // Step 5: Check what got stored
    const updatedTask = await database.get(
      `SELECT 
        motion_start_on,
        motion_scheduled_start,
        motion_scheduled_end,
        motion_status_name,
        motion_scheduling_issue,
        motion_completed,
        motion_deadline_type,
        notion_sync_needed
      FROM sync_tasks 
      WHERE notion_page_id = $1`,
      [dbTask.notion_page_id]
    );
    
    res.json({
      success: true,
      taskName: dbTask.notion_name,
      motionApiData: {
        scheduledStart: motionTask.scheduledStart,
        scheduledEnd: motionTask.scheduledEnd,
        status: motionTask.status?.name,
        startOn: motionTask.startOn
      },
      databaseAfterUpdate: updatedTask,
      notionSyncNeeded: updatedTask.notion_sync_needed
    });
    
  } catch (error) {
    logger.error('TEST: Error in flow test', { 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({ 
      error: error.message,
      hint: error.message.includes('column') ? 
        'Database columns may not exist - migrations not run' : 
        'Check logs for details'
    });
  }
});

// Check if database columns exist
router.get('/check-columns', async (req, res) => {
  try {
    const result = await database.pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'sync_tasks' 
      AND column_name LIKE 'motion_%'
      ORDER BY column_name
    `);
    
    const expectedColumns = [
      'motion_start_on',
      'motion_scheduled_start', 
      'motion_scheduled_end',
      'motion_scheduling_issue',
      'motion_status_name',
      'motion_status_resolved',
      'motion_completed',
      'motion_completed_time',
      'motion_deadline_type',
      'motion_updated_time'
    ];
    
    const existingColumns = result.rows.map(r => r.column_name);
    const missingColumns = expectedColumns.filter(col => !existingColumns.includes(col));
    
    res.json({
      existingMotionColumns: existingColumns,
      missingColumns,
      allColumnsExist: missingColumns.length === 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Force trigger fast sync endpoint
router.post('/trigger-fast-sync', async (req, res) => {
  try {
    logger.info('TEST: Manually triggering fast sync');
    const pollService = require('../services/pollService');
    
    // Get initial stats
    const beforeStats = await database.get(`
      SELECT 
        COUNT(CASE WHEN notion_sync_needed = true THEN 1 END) as pending_notion_updates,
        COUNT(CASE WHEN motion_sync_needed = true THEN 1 END) as pending_motion_operations
      FROM sync_tasks
    `);
    
    // Run fast sync
    await pollService.fastSync();
    
    // Get after stats
    const afterStats = await database.get(`
      SELECT 
        COUNT(CASE WHEN notion_sync_needed = true THEN 1 END) as pending_notion_updates,
        COUNT(CASE WHEN motion_sync_needed = true THEN 1 END) as pending_motion_operations
      FROM sync_tasks
    `);
    
    // Get sample of tasks that were synced
    const syncedTasks = await database.all(`
      SELECT 
        notion_page_id,
        notion_name,
        motion_task_id,
        motion_scheduled_start,
        motion_scheduled_end,
        motion_status_name
      FROM sync_tasks
      WHERE motion_task_id IS NOT NULL
        AND (motion_scheduled_start IS NOT NULL OR motion_scheduled_end IS NOT NULL)
      LIMIT 5
    `);
    
    res.json({
      success: true,
      message: 'Fast sync triggered successfully',
      before: beforeStats,
      after: afterStats,
      syncedNotionUpdates: beforeStats.pending_notion_updates - afterStats.pending_notion_updates,
      sampleSyncedTasks: syncedTasks
    });
    
  } catch (error) {
    logger.error('TEST: Error triggering fast sync', { 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({ 
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;