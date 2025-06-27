const express = require('express');
const database = require('../database');
const motionClient = require('../services/motionClient');
const logger = require('../utils/logger');

const router = express.Router();

// Restore Motion ID connections by matching task names
router.post('/restore', async (req, res) => {
  try {
    logger.info('Starting Motion ID restoration process');
    
    // Get all Motion tasks
    const motionResponse = await motionClient.listTasks();
    const motionTasks = motionResponse.tasks || [];
    
    // Get all database tasks that should have Motion IDs but don't
    const orphanedDbTasks = await database.all(`
      SELECT notion_page_id, notion_name, schedule_checkbox 
      FROM sync_tasks 
      WHERE motion_task_id IS NULL 
        AND schedule_checkbox = true
    `);
    
    logger.info(`Found ${motionTasks.length} Motion tasks and ${orphanedDbTasks.length} orphaned database tasks`);
    
    const results = {
      restored: [],
      unmatched: {
        motion: [],
        database: []
      }
    };
    
    // Match by name (case-insensitive)
    for (const dbTask of orphanedDbTasks) {
      const matchingMotionTask = motionTasks.find(mt => 
        mt.name.toLowerCase().trim() === dbTask.notion_name.toLowerCase().trim()
      );
      
      if (matchingMotionTask) {
        // Restore the Motion ID connection
        await database.pool.query(`
          UPDATE sync_tasks 
          SET motion_task_id = $1,
              motion_sync_needed = false,
              notion_sync_needed = true
          WHERE notion_page_id = $2
        `, [matchingMotionTask.id, dbTask.notion_page_id]);
        
        // Update Motion fields
        await database.updateMotionFields(dbTask.notion_page_id, matchingMotionTask);
        
        results.restored.push({
          name: dbTask.notion_name,
          motionId: matchingMotionTask.id,
          scheduledStart: matchingMotionTask.scheduledStart,
          scheduledEnd: matchingMotionTask.scheduledEnd
        });
        
        logger.info(`Restored connection: ${dbTask.notion_name} -> ${matchingMotionTask.id}`);
      } else {
        results.unmatched.database.push(dbTask.notion_name);
      }
    }
    
    // Find Motion tasks without database matches
    const restoredMotionIds = new Set(results.restored.map(r => r.motionId));
    results.unmatched.motion = motionTasks
      .filter(mt => !restoredMotionIds.has(mt.id))
      .map(mt => ({ id: mt.id, name: mt.name }));
    
    // Trigger fast sync to update Notion
    const pollService = require('../services/pollService');
    await pollService.fastSync();
    
    res.json({
      success: true,
      message: 'Motion ID restoration complete',
      totalMotionTasks: motionTasks.length,
      totalOrphanedDbTasks: orphanedDbTasks.length,
      restored: results.restored.length,
      results
    });
    
  } catch (error) {
    logger.error('Error during Motion ID restoration', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;