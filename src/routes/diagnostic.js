const express = require('express');
const notionClient = require('../services/notionClient');
const motionClient = require('../services/motionClient');
const mappingCache = require('../services/mappingCache');
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
    
    res.json({
      motionTaskCount: motionTasks.length,
      notionTasksWithMotionId: notionMotionIds.size,
      missingInNotion: missingSyncTasks.length,
      syncPercentage: Math.round((notionMotionIds.size / motionTasks.length) * 100),
      missingSample: missingSyncTasks.slice(0, 5).map(t => ({
        id: t.id,
        name: t.name,
        status: t.status?.name || t.status
      }))
    });
  } catch (error) {
    logger.error('Error in sync status diagnostic', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/cache-status', (req, res) => {
  const stats = mappingCache.getStats();
  res.json({
    cacheStats: stats,
    message: 'Cache is used to track Notion-Motion task mappings for deletion handling'
  });
});

router.get('/recent-webhooks', (req, res) => {
  const webhookLog = require('../services/webhookLog');
  res.json({
    recentWebhooks: webhookLog.getRecent(20),
    message: 'Recent webhook events'
  });
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

module.exports = router;