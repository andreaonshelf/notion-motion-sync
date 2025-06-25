const express = require('express');
const notionClient = require('../services/notionClient');
const motionClient = require('../services/motionClient');
const mappingCache = require('../services/mappingCache');
const syncService = require('../services/syncService');
const database = require('../database');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/notion-tasks', async (req, res) => {
  try {
    logger.info('Fetching all Notion tasks for diagnostic');
    
    // Query all tasks from Notion
    const notionTasks = await notionClient.queryDatabase();
    
    // Count tasks with Motion IDs
    const tasksWithMotionId = notionTasks.filter(task => task.motionTaskId);
    const tasksWithoutMotionId = notionTasks.filter(task => !task.motionTaskId);
    
    res.json({
      totalTasks: notionTasks.length,
      tasksWithMotionId: tasksWithMotionId.length,
      tasksWithoutMotionId: tasksWithoutMotionId.length,
      tasksWithMotionIdList: tasksWithMotionId.map(t => ({
        name: t.name,
        motionTaskId: t.motionTaskId,
        status: t.status,
        duration: t.duration,
        dueDate: t.dueDate,
        lastEdited: t.lastEdited
      })),
      recentTasks: notionTasks.slice(0, 5).map(t => ({
        name: t.name,
        motionTaskId: t.motionTaskId,
        status: t.status,
        duration: t.duration,
        id: t.id
      }))
    });
  } catch (error) {
    logger.error('Error in Notion diagnostic', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/motion-sync-status', async (req, res) => {
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
    
    // Find which Motion tasks are missing from Notion
    const missingSyncTasks = motionTasks.filter(
      task => !notionMotionIds.has(task.id)
    );
    
    // Find Raycast task to check duration
    const raycastMotion = motionTasks.find(t => t.name === 'Raycast');
    
    res.json({
      motionTaskCount: motionTasks.length,
      notionTasksWithMotionId: notionMotionIds.size,
      missingInNotion: missingSyncTasks.length,
      syncPercentage: Math.round((notionMotionIds.size / motionTasks.length) * 100),
      raycastMotionDuration: raycastMotion ? raycastMotion.duration : 'Raycast not found',
      missingSample: missingSyncTasks.slice(0, 5).map(t => ({
        id: t.id,
        name: t.name,
        status: t.status?.name || t.status,
        duration: t.duration
      }))
    });
  } catch (error) {
    logger.error('Error in sync status diagnostic', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/cache-status', async (req, res) => {
  try {
    const stats = await mappingCache.getStats();
    res.json({
      cacheStats: stats,
      message: 'Cache is backed by SQLite database for persistence'
    });
  } catch (error) {
    logger.error('Error getting cache stats', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/recent-webhooks', (req, res) => {
  const webhookLog = require('../services/webhookLog');
  res.json({
    recentWebhooks: webhookLog.getRecent(20),
    message: 'Recent webhook events'
  });
});

router.get('/motion-task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await motionClient.getTask(taskId);
    res.json({
      task: {
        id: task.id,
        name: task.name,
        duration: task.duration,
        status: task.status,
        priority: task.priority,
        description: task.description?.substring(0, 100)
      }
    });
  } catch (error) {
    logger.error('Error fetching Motion task', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post('/force-sync-task/:taskName', async (req, res) => {
  try {
    const { taskName } = req.params;
    logger.info('FORCE SYNC: Starting sync for task', { taskName });
    
    // Get task from Notion
    const notionTasks = await notionClient.queryDatabase();
    const notionTask = notionTasks.find(t => t.name === taskName);
    
    if (!notionTask) {
      return res.status(404).json({ error: `Task ${taskName} not found in Notion` });
    }
    
    logger.info('FORCE SYNC: Found task in Notion', {
      name: notionTask.name,
      id: notionTask.id,
      motionTaskId: notionTask.motionTaskId,
      duration: notionTask.duration,
      dueDate: notionTask.dueDate
    });
    
    // Sync it
    await syncService.syncNotionToMotion(notionTask.id);
    
    // Check Motion after sync
    await new Promise(resolve => setTimeout(resolve, 2000));
    const motionTask = await motionClient.getTask(notionTask.motionTaskId);
    
    res.json({
      success: true,
      notion: {
        name: notionTask.name,
        duration: notionTask.duration,
        dueDate: notionTask.dueDate
      },
      motionAfterSync: {
        id: motionTask.id,
        duration: motionTask.duration,
        dueDate: motionTask.dueDate
      }
    });
  } catch (error) {
    logger.error('FORCE SYNC: Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

router.post('/force-sync-raycast', async (req, res) => {
  try {
    logger.info('FORCE SYNC: Starting Raycast sync');
    
    // Get Raycast from Notion
    const notionTasks = await notionClient.queryDatabase();
    const raycastNotion = notionTasks.find(t => t.name === 'Raycast');
    
    if (!raycastNotion) {
      return res.status(404).json({ error: 'Raycast not found in Notion' });
    }
    
    logger.info('FORCE SYNC: Found Raycast in Notion', {
      id: raycastNotion.id,
      motionTaskId: raycastNotion.motionTaskId,
      duration: raycastNotion.duration
    });
    
    // Sync it
    await syncService.syncNotionToMotion(raycastNotion.id);
    
    // Check Motion after sync
    await new Promise(resolve => setTimeout(resolve, 2000));
    const motionTask = await motionClient.getTask(raycastNotion.motionTaskId);
    
    res.json({
      success: true,
      notion: {
        id: raycastNotion.id,
        duration: raycastNotion.duration
      },
      motionAfterSync: {
        id: motionTask.id,
        duration: motionTask.duration
      }
    });
  } catch (error) {
    logger.error('FORCE SYNC: Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

router.post('/test-duration-update/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const duration = 90;
    
    logger.info('TEST: Updating duration directly', { taskId, duration });
    
    const result = await motionClient.updateTask(taskId, {
      duration: duration
    });
    
    res.json({
      success: true,
      taskId,
      duration,
      result: {
        id: result.id,
        name: result.name,
        duration: result.duration
      }
    });
  } catch (error) {
    logger.error('TEST: Error updating duration', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

router.get('/trial-tasks', async (req, res) => {
  try {
    // Get Motion tasks
    const motionResponse = await motionClient.listTasks();
    const motionTasks = motionResponse.tasks || [];
    
    // Get Notion tasks
    const notionTasks = await notionClient.queryDatabase();
    
    // Find all "trial" tasks
    const motionTrialTasks = motionTasks.filter(t => 
      t.name.toLowerCase().includes('trial')
    );
    
    const notionTrialTasks = notionTasks.filter(t => 
      t.name.toLowerCase().includes('trial')
    );
    
    res.json({
      motion: {
        count: motionTrialTasks.length,
        tasks: motionTrialTasks.map(t => ({
          id: t.id,
          name: t.name,
          status: t.status?.name || t.status
        }))
      },
      notion: {
        count: notionTrialTasks.length,
        tasks: notionTrialTasks.map(t => ({
          id: t.id,
          name: t.name,
          motionTaskId: t.motionTaskId,
          status: t.status
        }))
      }
    });
  } catch (error) {
    logger.error('Error in trial tasks diagnostic', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/database-stats', async (req, res) => {
  try {
    const stats = await database.getStats();
    const needingSync = await database.getTasksNeedingSync(10);
    
    res.json({
      stats,
      tasksNeedingSync: needingSync.length,
      needingSyncSample: needingSync.slice(0, 5).map(t => ({
        notion_page_id: t.notion_page_id,
        notion_name: t.notion_name,
        sync_status: t.sync_status,
        error_message: t.error_message,
        last_edited: t.notion_last_edited,
        last_synced: t.motion_last_synced
      }))
    });
  } catch (error) {
    logger.error('Error getting database stats', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/sync-history/:pageId?', async (req, res) => {
  try {
    const { pageId } = req.params;
    let history;
    
    if (pageId) {
      history = await database.all(
        'SELECT * FROM sync_history WHERE notion_page_id = $1 ORDER BY timestamp DESC LIMIT 20',
        [pageId]
      );
    } else {
      history = await database.all(
        'SELECT * FROM sync_history ORDER BY timestamp DESC LIMIT 50'
      );
    }
    
    res.json({
      count: history.length,
      history: history.map(h => ({
        ...h,
        changes: h.changes ? JSON.parse(h.changes) : null
      }))
    });
  } catch (error) {
    logger.error('Error getting sync history', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/database-errors', async (req, res) => {
  try {
    const errors = await database.all(`
      SELECT * FROM sync_tasks 
      WHERE sync_status = 'error' 
      ORDER BY updated_at DESC 
      LIMIT 20
    `);
    
    res.json({
      errorCount: errors.length,
      errors: errors.map(e => ({
        notion_page_id: e.notion_page_id,
        notion_name: e.notion_name,
        error_message: e.error_message,
        error_count: e.error_count,
        last_attempt: e.updated_at
      }))
    });
  } catch (error) {
    logger.error('Error getting database errors', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;