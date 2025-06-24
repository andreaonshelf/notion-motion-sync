const express = require('express');
const syncService = require('../services/syncService');
const pollService = require('../services/pollService');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/full', async (req, res) => {
  try {
    logger.info('Manual full sync requested');
    await syncService.performFullSync();
    res.json({ success: true, message: 'Full sync completed' });
  } catch (error) {
    logger.error('Error during manual full sync', { error: error.message });
    res.status(500).json({ error: 'Sync failed', details: error.message });
  }
});

router.post('/motion-to-notion', async (req, res) => {
  try {
    logger.info('Manual Motion to Notion sync requested');
    await syncService.syncAllMotionTasks();
    res.json({ success: true, message: 'Motion to Notion sync completed' });
  } catch (error) {
    logger.error('Error during Motion to Notion sync', { error: error.message });
    res.status(500).json({ error: 'Sync failed', details: error.message });
  }
});

router.post('/notion/:pageId', async (req, res) => {
  try {
    const { pageId } = req.params;
    logger.info('Manual Notion sync requested', { pageId });
    await syncService.syncNotionToMotion(pageId);
    res.json({ success: true, message: 'Notion task synced' });
  } catch (error) {
    logger.error('Error during manual Notion sync', { error: error.message });
    res.status(500).json({ error: 'Sync failed', details: error.message });
  }
});

router.post('/motion/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    logger.info('Manual Motion sync requested', { taskId });
    await syncService.syncMotionToNotion(taskId);
    res.json({ success: true, message: 'Motion task synced' });
  } catch (error) {
    logger.error('Error during manual Motion sync', { error: error.message });
    res.status(500).json({ error: 'Sync failed', details: error.message });
  }
});

// Manually trigger Motion poll
router.post('/poll-motion', async (req, res) => {
  try {
    logger.info('Manually triggering Motion poll');
    await pollService.pollMotionChanges();
    res.json({ success: true, message: 'Motion poll completed' });
  } catch (error) {
    logger.error('Motion poll error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Check poll service status
router.get('/poll-status', (req, res) => {
  const isRunning = pollService.pollInterval !== null;
  res.json({
    pollServiceRunning: isRunning,
    lastSyncCount: pollService.lastSyncTimes.size,
    checksumCount: pollService.motionTaskChecksums.size
  });
});

module.exports = router;