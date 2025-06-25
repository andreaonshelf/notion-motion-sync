const notionClient = require('./notionClient');
const motionClient = require('./motionClient');
const syncService = require('./syncService');
const database = require('../database');
const logger = require('../utils/logger');

class PollService {
  constructor() {
    this.pollInterval = null;
  }

  start(intervalMinutes = 3) {
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
      
      // Step 1: Update database with latest Notion data
      await this.updateNotionData();
      
      // Step 2: Sync only tasks that need it
      await this.syncChangedTasks();
      
      // Step 3: Clean up orphaned Motion tasks
      await this.cleanupOrphanedMotionTasks();
      
    } catch (error) {
      logger.error('Error during polling', { error: error.message });
    }
  }
  
  async updateNotionData() {
    try {
      logger.info('Updating Notion data in database...');
      
      // Query only schedulable tasks from Notion
      const filter = {
        and: [
          { property: 'Duration (minutes)', number: { is_not_empty: true } },
          { property: 'Due date', date: { is_not_empty: true } },
          { 
            or: [
              { property: 'Status', status: { equals: 'Not started' } },
              { property: 'Status', status: { equals: 'In progress' } }
            ]
          }
        ]
      };
      
      const notionTasks = await notionClient.queryDatabase(filter);
      logger.info(`Found ${notionTasks.length} schedulable tasks in Notion`);
      
      // Update database with latest task data
      for (const task of notionTasks) {
        await database.upsertSyncTask(task.id, {
          name: task.name,
          lastEdited: task.lastEdited
        });
        
        // If task has Motion ID, ensure it's in database
        if (task.motionTaskId) {
          const mapping = await database.getMappingByNotionId(task.id);
          if (!mapping || !mapping.motion_task_id) {
            await database.setMotionTaskId(task.id, task.motionTaskId);
          }
        }
      }
    } catch (error) {
      logger.error('Error updating Notion data', { error: error.message });
    }
  }
  
  async syncChangedTasks() {
    try {
      // Get tasks that need syncing from database
      const tasksToSync = await database.getTasksNeedingSync(5); // Process 5 at a time
      
      if (tasksToSync.length === 0) {
        logger.info('No tasks need syncing');
        return;
      }
      
      logger.info(`Found ${tasksToSync.length} tasks needing sync`);
      
      for (const syncTask of tasksToSync) {
        try {
          // Lock the task
          const locked = await database.lockTaskForSync(syncTask.id);
          if (!locked) {
            logger.warn('Could not lock task for sync', { id: syncTask.id });
            continue;
          }
          
          // Log the sync attempt
          await database.logSync(
            syncTask.notion_page_id,
            syncTask.motion_task_id,
            'sync_start'
          );
          
          // Get fresh data from Notion
          const notionTask = await notionClient.getTask(syncTask.notion_page_id);
          
          // Check if task still meets criteria
          if (!notionTask.duration || !notionTask.dueDate || 
              notionTask.status === 'Done' || notionTask.status === 'Archived') {
            logger.info('Task no longer needs scheduling', { 
              name: notionTask.name,
              status: notionTask.status 
            });
            
            // If it has a Motion ID, delete from Motion
            if (syncTask.motion_task_id) {
              await motionClient.deleteTask(syncTask.motion_task_id);
              await database.removeMapping(syncTask.notion_page_id);
            }
            continue;
          }
          
          // Sync to Motion
          await syncService.syncNotionToMotion(syncTask.notion_page_id);
          
          // Mark sync successful
          await database.markSyncSuccess(
            syncTask.id,
            notionTask.motionTaskId || syncTask.motion_task_id,
            notionTask.duration,
            notionTask.dueDate
          );
          
          // Log success
          await database.logSync(
            syncTask.notion_page_id,
            notionTask.motionTaskId || syncTask.motion_task_id,
            'sync_success',
            {
              duration: notionTask.duration,
              dueDate: notionTask.dueDate,
              status: notionTask.status
            }
          );
          
          // Rate limit between syncs
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          logger.error('Failed to sync task', {
            id: syncTask.id,
            error: error.message
          });
          
          // Mark sync failed
          await database.markSyncError(syncTask.id, error.message);
          
          // Log error
          await database.logSync(
            syncTask.notion_page_id,
            syncTask.motion_task_id,
            'sync_error',
            null,
            error.message
          );
          
          // If rate limited, wait longer
          if (error.message.includes('429')) {
            logger.info('Rate limited, waiting 30 seconds...');
            await new Promise(resolve => setTimeout(resolve, 30000));
          }
        }
      }
    } catch (error) {
      logger.error('Error syncing changed tasks', { error: error.message });
    }
  }
  
  async cleanupOrphanedMotionTasks() {
    try {
      // Get all Motion tasks
      const motionResponse = await motionClient.listTasks();
      const motionTasks = motionResponse.tasks || [];
      
      // Get all Motion IDs we're tracking
      const trackedMotionIds = await database.db.all(
        'SELECT motion_task_id FROM sync_tasks WHERE motion_task_id IS NOT NULL'
      );
      const trackedSet = new Set(trackedMotionIds.map(r => r.motion_task_id));
      
      // Find orphans
      const orphans = motionTasks.filter(task => !trackedSet.has(task.id));
      
      if (orphans.length > 0) {
        logger.info(`Found ${orphans.length} orphaned Motion tasks`);
        
        for (const orphan of orphans) {
          try {
            logger.info(`Deleting orphaned Motion task: ${orphan.name}`);
            await motionClient.deleteTask(orphan.id);
            
            // Log deletion
            await database.logSync(null, orphan.id, 'orphan_deleted', {
              name: orphan.name
            });
            
            // Rate limit
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            logger.error(`Failed to delete orphan: ${orphan.name}`, { 
              error: error.message 
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error cleaning up orphans', { error: error.message });
    }
  }
}

module.exports = new PollService();