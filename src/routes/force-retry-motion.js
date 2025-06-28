const express = require('express');
const router = express.Router();
const database = require('../database');
const logger = require('../utils/logger');

// Force retry Motion operations by clearing retry delays
router.post('/clear-retry-delays', async (req, res) => {
  try {
    logger.info('Clearing Motion retry delays to force immediate retry');
    
    // Clear motion_last_attempt for all scheduled tasks without Motion IDs
    const result = await database.run(`
      UPDATE sync_tasks 
      SET motion_last_attempt = NULL,
          motion_sync_needed = true,
          motion_priority = 1
      WHERE schedule_checkbox = true 
      AND motion_task_id IS NULL
    `);
    
    logger.info(`Cleared retry delays for ${result.changes} tasks`);
    
    res.json({
      success: true,
      message: `Cleared retry delays for ${result.changes} tasks`,
      tasksReset: result.changes,
      note: 'Tasks will be retried in next slow sync (within 3 minutes)'
    });
    
  } catch (error) {
    logger.error('Failed to clear retry delays', { error: error.message });
    res.status(500).json({ 
      error: error.message
    });
  }
});

module.exports = router;