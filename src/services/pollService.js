const notionClient = require('./notionClient');
const motionClient = require('./motionClient');
const syncService = require('./syncService');
const database = require('../database');
const logger = require('../utils/logger');

class PollService {
  constructor() {
    this.fastInterval = null;
    this.slowInterval = null;
  }

  start(fastIntervalSeconds = 60, slowIntervalMinutes = 3) {
    logger.info(`Starting two-speed poll service: fast=${fastIntervalSeconds}s, slow=${slowIntervalMinutes}min`);
    
    // Run immediately on start
    this.fastSync();
    this.slowSync();
    
    // Fast sync: Notion ↔ Database (every 60 seconds)
    this.fastInterval = setInterval(() => {
      this.fastSync();
    }, fastIntervalSeconds * 1000);
    
    // Slow sync: Database ↔ Motion (every 3 minutes)
    this.slowInterval = setInterval(() => {
      this.slowSync();
    }, slowIntervalMinutes * 60 * 1000);
  }

  stop() {
    if (this.fastInterval) {
      clearInterval(this.fastInterval);
      this.fastInterval = null;
    }
    if (this.slowInterval) {
      clearInterval(this.slowInterval);
      this.slowInterval = null;
    }
    logger.info('Two-speed poll service stopped');
  }

  // Fast sync: Notion ↔ Database (every 60 seconds)
  async fastSync() {
    try {
      logger.info('=== FAST SYNC START ===');
      
      // Step 1: Notion → Database (capture all user changes)
      await this.syncNotionToDatabase();
      
      // Step 2: Database → Notion (show Motion IDs and status updates)
      await this.syncDatabaseToNotion();
      
      logger.info('=== FAST SYNC END ===');
    } catch (error) {
      logger.error('Error during fast sync', { error: error.message, stack: error.stack });
    }
  }

  // Slow sync: Database ↔ Motion (every 3 minutes, rate-limited)
  async slowSync() {
    try {
      logger.info('=== SLOW SYNC START ===');
      
      // Step 1: Detect which tasks need Motion operations
      await this.detectMotionSyncNeeds();
      
      // Step 2: Process Motion operations (rate-limited)
      await this.processMotionOperations();
      
      logger.info('=== SLOW SYNC END ===');
    } catch (error) {
      logger.error('Error during slow sync', { error: error.message, stack: error.stack });
    }
  }

  // Notion → Database: Capture all changes from Notion
  async syncNotionToDatabase() {
    try {
      logger.info('Syncing Notion → Database...');
      
      // Query ALL tasks from Notion (database mirrors Notion completely)
      const notionTasks = await notionClient.queryDatabase();
      logger.info(`Found ${notionTasks.length} total tasks in Notion`);
      
      let updatedCount = 0;
      
      // Update database with ALL task data
      for (const task of notionTasks) {
        const oldTask = await database.getMappingByNotionId(task.id);
        
        await database.upsertSyncTask(task.id, {
          name: task.name,
          lastEdited: task.lastEdited,
          schedule: task.schedule,
          duration: task.duration,
          dueDate: task.dueDate,
          status: task.status
        });
        
        // Handle Motion ID based on schedule status
        if (task.motionTaskId && task.schedule && (!oldTask || !oldTask.motion_task_id)) {
          // Preserve Motion ID for scheduled tasks
          await database.pool.query(
            'UPDATE sync_tasks SET motion_task_id = $1 WHERE notion_page_id = $2',
            [task.motionTaskId, task.id]
          );
        } else if (task.motionTaskId && !task.schedule) {
          // Clear Motion ID for unscheduled tasks and mark for Notion sync
          await database.pool.query(
            'UPDATE sync_tasks SET motion_task_id = NULL, notion_sync_needed = true WHERE notion_page_id = $1',
            [task.id]
          );
          logger.info(`Clearing Motion ID from unscheduled task: ${task.name}`);
        }
        
        updatedCount++;
      }
      
      logger.info(`Updated ${updatedCount} tasks in database`);
      
    } catch (error) {
      logger.error('Error syncing Notion to database', { error: error.message });
    }
  }

  // Database → Notion: Show Motion IDs and status updates
  async syncDatabaseToNotion() {
    try {
      const tasksToUpdate = await database.getNotionTasksToUpdate(20);
      
      if (tasksToUpdate.length === 0) {
        logger.debug('No Notion updates needed');
        return;
      }
      
      logger.info(`Syncing ${tasksToUpdate.length} updates to Notion`);
      
      for (const task of tasksToUpdate) {
        try {
          // Update Notion with Motion ID from database
          await notionClient.updateTask(task.notion_page_id, {
            motionTaskId: task.motion_task_id || ''
          });
          
          // Mark as completed
          await database.completeNotionSync(task.notion_page_id);
          
          logger.debug(`Updated Notion task: ${task.notion_name}`, {
            motionId: task.motion_task_id
          });
          
          // Rate limit
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (error) {
          logger.error(`Failed to update Notion task: ${task.notion_name}`, {
            error: error.message
          });
        }
      }
      
    } catch (error) {
      logger.error('Error syncing database to Notion', { error: error.message });
    }
  }

  // Detect which tasks need Motion operations
  async detectMotionSyncNeeds() {
    try {
      logger.info('Detecting Motion sync needs...');
      
      // Use database method to detect needs
      await database.detectMotionSyncNeeds();
      
      // Get count of tasks needing Motion operations
      const tasksNeedingMotion = await database.getMotionTasksToProcess(100); // Get count
      logger.info(`${tasksNeedingMotion.length} tasks need Motion operations`);
      
    } catch (error) {
      logger.error('Error detecting Motion sync needs', { error: error.message });
    }
  }

  // Process Motion operations (rate-limited)
  async processMotionOperations() {
    try {
      // Get limited number of tasks to process (rate limiting)
      const tasksToProcess = await database.getMotionTasksToProcess(5);
      
      if (tasksToProcess.length === 0) {
        logger.debug('No Motion operations needed');
        return;
      }
      
      logger.info(`Processing ${tasksToProcess.length} Motion operations`);
      
      for (const task of tasksToProcess) {
        try {
          await this.processMotionTask(task);
          
          // Rate limit between Motion API calls (2 seconds)
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          logger.error(`Failed Motion operation for: ${task.notion_name}`, {
            error: error.message
          });
          
          // Mark as failed, will retry later
          await database.pool.query(
            'UPDATE sync_tasks SET motion_last_attempt = CURRENT_TIMESTAMP WHERE notion_page_id = $1',
            [task.notion_page_id]
          );
        }
      }
      
    } catch (error) {
      logger.error('Error processing Motion operations', { error: error.message });
    }
  }

  // Process a single Motion task operation
  async processMotionTask(task) {
    const isScheduled = task.schedule_checkbox;
    const hasMotionId = !!task.motion_task_id;
    
    if (isScheduled && !hasMotionId) {
      // CREATE: New scheduled task
      logger.info(`Creating Motion task: ${task.notion_name}`);
      
      const motionTaskData = {
        name: task.notion_name,
        duration: task.duration,
        dueDate: task.due_date,
        status: 'Not started'
      };
      
      const motionTask = await motionClient.createTask(motionTaskData);
      
      // Verify task was created
      await motionClient.getTask(motionTask.id);
      
      // Update database with Motion ID and mark for Notion sync
      await database.completeMotionSync(task.notion_page_id, motionTask.id);
      
      logger.info(`Motion task created: ${task.notion_name}`, { motionId: motionTask.id });
      
    } else if (isScheduled && hasMotionId) {
      // UPDATE: Existing Motion task
      logger.info(`Updating Motion task: ${task.notion_name}`);
      
      const updateData = {
        name: task.notion_name,
        duration: task.duration,
        dueDate: task.due_date
      };
      
      await motionClient.updateTask(task.motion_task_id, updateData);
      
      // Mark as completed
      await database.completeMotionSync(task.notion_page_id, task.motion_task_id);
      
      logger.info(`Motion task updated: ${task.notion_name}`);
      
    } else if (!isScheduled && hasMotionId) {
      // DELETE: Unscheduled task with Motion ID
      logger.info(`Deleting Motion task: ${task.notion_name}`);
      
      await motionClient.deleteTask(task.motion_task_id);
      
      // Clear Motion ID from database and mark for Notion sync
      await database.completeMotionSync(task.notion_page_id, null);
      
      logger.info(`Motion task deleted: ${task.notion_name}`);
      
    } else {
      // No operation needed
      await database.completeMotionSync(task.notion_page_id, task.motion_task_id);
    }
  }
  
  // Legacy method for backward compatibility
  async pollForChanges() {
    logger.warn('pollForChanges() is deprecated, using fastSync() + slowSync()');
    await this.fastSync();
    await this.slowSync();
  }
}

module.exports = new PollService();