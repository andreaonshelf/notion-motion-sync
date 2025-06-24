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
      logger.info('Polling for changes...');
      
      // FIRST: Clean up any orphaned Motion tasks (deleted from Notion)
      const motionResponse = await motionClient.listTasks();
      await this.checkForOrphanedMotionTasks(motionResponse.tasks || []);
      
      // THEN: Poll Motion changes (but don't create in Notion)
      await this.pollMotionChanges();
      
      // THEN: Check for field changes in existing synced tasks
      await this.checkForFieldChanges();
      
      // FINALLY: Check for any Notion tasks without Motion IDs
      await this.syncUnsyncedNotionTasks();
      
    } catch (error) {
      logger.error('Error during polling', { error: error.message });
    }
  }
  
  async syncUnsyncedNotionTasks() {
    try {
      const notionClient = require('./notionClient');
      const syncService = require('./syncService');
      
      const tasks = await notionClient.queryDatabase();
      const unsyncedTasks = tasks.filter(task => !task.motionTaskId);
      
      if (unsyncedTasks.length > 0) {
        logger.info(`Found ${unsyncedTasks.length} unsynced Notion tasks during poll`);
        
        for (const task of unsyncedTasks) {
          try {
            await syncService.syncNotionToMotion(task.id);
            logger.info(`Synced previously unsynced task: ${task.name}`);
            // Rate limit
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (error) {
            logger.error(`Failed to sync unsynced task ${task.name}`, { error: error.message });
          }
        }
      }
    } catch (error) {
      logger.error('Error checking for unsynced Notion tasks', { error: error.message });
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
          // Only sync if this task already exists in Notion
          // Don't create new Notion tasks from Motion
          logger.info(`Detected Motion ${isFirstRun ? 'task' : 'change'}: ${task.name}`);
          this.motionTaskChecksums.set(task.id, checksum);
          changedCount++;
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
      
      // Don't need this here anymore - it's called at the beginning of pollForChanges
      
      if (changedCount > 0 || deletedCount > 0) {
        logger.info(`Motion poll: ${changedCount} changed, ${deletedCount} deleted`);
      }
    } catch (error) {
      logger.error('Error polling Motion', { error: error.message });
    }
  }
  
  async checkForOrphanedMotionTasks(motionTasks) {
    try {
      const notionClient = require('./notionClient');
      
      // Get all Notion tasks
      const notionTasks = await notionClient.queryDatabase();
      
      // Create a set of all Motion IDs that exist in Notion
      const notionMotionIds = new Set(
        notionTasks
          .filter(task => task.motionTaskId)
          .map(task => task.motionTaskId)
      );
      
      logger.info(`Notion has ${notionMotionIds.size} tasks with Motion IDs`);
      logger.info(`Motion has ${motionTasks.length} total tasks`);
      
      // Check each Motion task
      let deletedCount = 0;
      for (const motionTask of motionTasks) {
        if (!notionMotionIds.has(motionTask.id)) {
          // This Motion task has no corresponding Notion task
          logger.info(`Motion task "${motionTask.name}" (ID: ${motionTask.id}) has no corresponding Notion task - deleting from Motion`);
          try {
            await motionClient.deleteTask(motionTask.id);
            logger.info(`Deleted orphaned Motion task: ${motionTask.name}`);
            deletedCount++;
            // Rate limit deletions
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            logger.error(`Failed to delete orphaned Motion task: ${motionTask.name}`, { error: error.message });
          }
        }
      }
      
      if (deletedCount > 0) {
        logger.info(`Deleted ${deletedCount} orphaned Motion tasks`);
      }
    } catch (error) {
      logger.error('Error checking for orphaned Motion tasks', { error: error.message });
    }
  }

  async checkForFieldChanges() {
    try {
      logger.info('Checking for field changes in synced tasks...');
      
      // Get all Notion tasks that have Motion IDs
      const notionTasks = await notionClient.queryDatabase();
      const syncedTasks = notionTasks.filter(task => task.motionTaskId);
      
      // Get all Motion tasks
      const motionResponse = await motionClient.listTasks();
      const motionTasksMap = new Map();
      for (const task of motionResponse.tasks || []) {
        motionTasksMap.set(task.id, task);
      }
      
      let updatedCount = 0;
      
      // Check each synced task for differences
      for (const notionTask of syncedTasks) {
        const motionTask = motionTasksMap.get(notionTask.motionTaskId);
        
        if (!motionTask) {
          logger.warn('Motion task not found for synced Notion task', {
            notionTaskId: notionTask.id,
            motionTaskId: notionTask.motionTaskId
          });
          continue;
        }
        
        // For tasks with duration in Notion, fetch full details from Motion
        // since listTasks doesn't return duration
        let motionDuration = motionTask.duration;
        if (notionTask.duration !== null && motionDuration === undefined) {
          try {
            const fullMotionTask = await motionClient.getTask(motionTask.id);
            motionDuration = fullMotionTask.duration;
            motionTask.duration = motionDuration; // Update for comparison
          } catch (error) {
            logger.error('Failed to fetch full Motion task details', {
              taskId: motionTask.id,
              error: error.message
            });
          }
        }
        
        // Log comparison for Raycast task
        if (notionTask.name === 'Raycast') {
          logger.info('DEBUG: Raycast task comparison', {
            notionDuration: notionTask.duration,
            motionDuration: motionDuration,
            durationsMatch: notionTask.duration === motionDuration,
            notionStatus: notionTask.status,
            motionStatus: this.mapMotionStatusToNotion(motionTask.status?.name || motionTask.status)
          });
        }
        
        // Check if any fields need updating
        const needsUpdate = 
          notionTask.name !== motionTask.name ||
          notionTask.description !== (motionTask.description || '') ||
          notionTask.status !== this.mapMotionStatusToNotion(motionTask.status?.name || motionTask.status) ||
          notionTask.priority !== this.mapMotionPriorityToNotion(motionTask.priority) ||
          notionTask.dueDate !== motionTask.dueDate ||
          notionTask.duration !== motionDuration;
        
        if (needsUpdate) {
          logger.info('Field change detected, syncing Notion to Motion', {
            taskName: notionTask.name,
            notionDuration: notionTask.duration,
            motionDuration: motionTask.duration
          });
          
          try {
            await syncService.syncNotionToMotion(notionTask.id);
            updatedCount++;
            // Rate limit
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            logger.error('Failed to sync field changes', {
              taskName: notionTask.name,
              error: error.message
            });
          }
        }
      }
      
      if (updatedCount > 0) {
        logger.info(`Updated ${updatedCount} tasks with field changes`);
      }
    } catch (error) {
      logger.error('Error checking for field changes', { error: error.message });
    }
  }
  
  mapMotionStatusToNotion(motionStatus) {
    const statusMap = {
      'Todo': 'Not started',
      'In Progress': 'In progress',
      'Completed': 'Done',
      'Canceled': 'Archived',
      'Backlog': 'Not started',
      'Blocked': 'In progress'
    };
    return statusMap[motionStatus] || 'Not started';
  }
  
  mapMotionPriorityToNotion(motionPriority) {
    const priorityMap = {
      'HIGH': 'High',
      'MEDIUM': 'Medium',
      'LOW': 'Low'
    };
    return priorityMap[motionPriority] || 'Medium';
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