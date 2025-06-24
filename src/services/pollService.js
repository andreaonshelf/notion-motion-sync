const notionClient = require('./notionClient');
const motionClient = require('./motionClient');
const syncService = require('./syncService');
const logger = require('../utils/logger');

class PollService {
  constructor() {
    this.lastSyncTimes = new Map();
    this.motionTaskChecksums = new Map();
    this.pollInterval = null;
  }

  start(intervalMinutes = 5) {
    logger.info(`Starting poll service with ${intervalMinutes} minute interval`);
    
    // Run immediately on start
    this.pollForChanges();
    
    // Then run every interval
    this.pollInterval = setInterval(() => {
      this.pollForChanges();
    }, intervalMinutes * 60 * 1000);
  }

  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      logger.info('Poll service stopped');
    }
  }

  async pollForChanges() {
    try {
      logger.info('Polling for Motion changes...');
      
      // Only poll Motion since Notion has webhooks
      await this.pollMotionChanges();
      
    } catch (error) {
      logger.error('Error during polling', { error: error.message });
    }
  }

  async pollNotionChanges() {
    try {
      const tasks = await notionClient.queryDatabase();
      let changedCount = 0;
      
      for (const task of tasks) {
        const lastSync = this.lastSyncTimes.get(task.id);
        const taskLastEdited = new Date(task.lastEdited || task.lastSynced || 0).getTime();
        
        // If we haven't seen this task or it's been updated
        if (!lastSync || taskLastEdited > lastSync) {
          logger.info(`Detected Notion change: ${task.name}`);
          await syncService.syncNotionToMotion(task.id);
          this.lastSyncTimes.set(task.id, Date.now());
          changedCount++;
        }
      }
      
      if (changedCount > 0) {
        logger.info(`Notion poll: ${changedCount} tasks synced`);
      }
    } catch (error) {
      logger.error('Error polling Notion', { error: error.message });
    }
  }

  async pollMotionChanges() {
    try {
      const motionTasks = await motionClient.listTasks();
      let changedCount = 0;
      let deletedCount = 0;
      
      // Track current Motion task IDs
      const currentMotionIds = new Set();
      
      // If this is the first run (no checksums), sync all tasks
      const isFirstRun = this.motionTaskChecksums.size === 0;
      if (isFirstRun) {
        logger.info('First run detected, syncing all Motion tasks...');
      }
      
      // Check for changes in existing tasks
      for (const task of motionTasks.tasks || []) {
        currentMotionIds.add(task.id);
        const checksum = this.generateChecksum(task);
        const lastChecksum = this.motionTaskChecksums.get(task.id);
        
        if (isFirstRun || lastChecksum !== checksum) {
          try {
            logger.info(`Detected Motion ${isFirstRun ? 'task' : 'change'}: ${task.name}`);
            await syncService.syncMotionToNotion(task.id);
            this.motionTaskChecksums.set(task.id, checksum);
            changedCount++;
            
            // Add longer delay to avoid rate limits (Motion allows ~1 request per second)
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            logger.error(`Failed to sync Motion task: ${task.name}`, { error: error.message });
            
            // If rate limited, wait much longer and continue
            if (error.message.includes('429') || error.message.includes('Rate limit')) {
              logger.info('Rate limited, waiting 10 seconds...');
              await new Promise(resolve => setTimeout(resolve, 10000));
            }
          }
        }
      }
      
      // Check for deleted tasks
      for (const [taskId, checksum] of this.motionTaskChecksums) {
        if (!currentMotionIds.has(taskId)) {
          logger.info(`Detected Motion deletion: ${taskId}`);
          await syncService.handleMotionDeletion(taskId);
          this.motionTaskChecksums.delete(taskId);
          deletedCount++;
        }
      }
      
      if (changedCount > 0 || deletedCount > 0) {
        logger.info(`Motion poll: ${changedCount} changed, ${deletedCount} deleted`);
      }
    } catch (error) {
      logger.error('Error polling Motion', { error: error.message });
    }
  }

  generateChecksum(task) {
    // Create a simple checksum of key fields
    return JSON.stringify({
      name: task.name,
      status: task.status?.name || task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      description: task.description
    });
  }
}

module.exports = new PollService();