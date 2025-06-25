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
        
        // Check if we need to preserve existing Motion ID that Notion has
        if (task.motionTaskId && (!oldTask || !oldTask.motion_task_id)) {
          await database.pool.query(
            'UPDATE sync_tasks SET motion_task_id = $1 WHERE notion_page_id = $2',
            [task.motionTaskId, task.id]
          );
        }
        
        updatedCount++;
      }
      
      logger.info(`Updated ${updatedCount} tasks in database`);
      
    } catch (error) {
      logger.error('Error syncing Notion to database', { error: error.message });
    }
  }
  
  async syncChangedTasks() {
    try {
      // Get tasks that need syncing from database - only those with schedule = true
      const tasksToSync = await database.getScheduledTasksNeedingSync(5); // Process 5 at a time
      
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
          
          // Check if task still has schedule checkbox checked
          if (!notionTask.schedule) {
            logger.info('Task schedule unchecked, removing from Motion', { 
              name: notionTask.name,
              hadMotionId: !!syncTask.motion_task_id
            });
            
            // If it has a Motion ID, delete from Motion
            if (syncTask.motion_task_id) {
              try {
                await motionClient.deleteTask(syncTask.motion_task_id);
                await database.pool.query(
                  'UPDATE sync_tasks SET motion_task_id = NULL WHERE notion_page_id = $1',
                  [syncTask.notion_page_id]
                );
                await database.logSync(syncTask.notion_page_id, syncTask.motion_task_id, 'schedule_unchecked', {
                  name: notionTask.name
                });
              } catch (error) {
                logger.error('Failed to delete Motion task', { error: error.message });
              }
            }
            continue;
          }
          
          // Check if Motion task exists and has correct data
          let needsSync = true;
          if (syncTask.motion_task_id) {
            try {
              const motionTask = await motionClient.getTask(syncTask.motion_task_id);
              
              // Check if all fields match
              const durationMatches = motionTask.duration === notionTask.duration;
              const dueDateMatches = motionTask.dueDate && 
                new Date(motionTask.dueDate).toISOString().split('T')[0] === notionTask.dueDate;
              
              if (!durationMatches || !dueDateMatches) {
                logger.info('Task fields mismatch, forcing sync', {
                  name: notionTask.name,
                  durationMismatch: !durationMatches,
                  dueDateMismatch: !dueDateMatches,
                  motionDuration: motionTask.duration,
                  notionDuration: notionTask.duration,
                  motionDueDate: motionTask.dueDate,
                  notionDueDate: notionTask.dueDate
                });
                needsSync = true;
              } else {
                needsSync = false;
              }
            } catch (error) {
              logger.warn('Could not fetch Motion task, will sync', { 
                motionTaskId: syncTask.motion_task_id,
                error: error.message 
              });
              needsSync = true;
            }
          }
          
          if (needsSync) {
            // Sync to Motion
            await syncService.syncNotionToMotion(syncTask.notion_page_id);
          } else {
            logger.debug('Task already in sync, skipping', { name: notionTask.name });
          }
          
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
      const trackedMotionIds = await database.all(
        'SELECT motion_task_id FROM sync_tasks WHERE motion_task_id IS NOT NULL'
      );
      const trackedSet = new Set(trackedMotionIds.map(r => r.motion_task_id));
      
      // Get all Motion IDs from Notion that have Schedule = true
      const notionTasks = await notionClient.queryDatabase();
      const scheduledNotionMotionIds = new Set(
        notionTasks
          .filter(task => task.schedule && task.motionTaskId)
          .map(task => task.motionTaskId)
      );
      
      // Find orphans - tasks that are in Motion but should NOT be:
      // 1. Not in our database with schedule = true
      // 2. Not in Notion with schedule = true
      const orphans = motionTasks.filter(task => 
        !scheduledNotionMotionIds.has(task.id)
      );
      
      // Additional safety: only delete tasks older than 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const safeOrphans = orphans.filter(task => {
        const createdTime = new Date(task.createdTime || task.updatedTime);
        return createdTime < fiveMinutesAgo;
      });
      
      if (safeOrphans.length > 0) {
        logger.info(`Found ${safeOrphans.length} orphaned Motion tasks (older than 5 minutes)`);
        
        for (const orphan of safeOrphans) {
          try {
            logger.info(`Deleting orphaned Motion task: ${orphan.name}`, {
              id: orphan.id,
              created: orphan.createdTime,
              age: `${Math.round((Date.now() - new Date(orphan.createdTime).getTime()) / 60000)} minutes`
            });
            
            // Delete from Motion
            await motionClient.deleteTask(orphan.id);
            
            // Find and clear the Motion ID from Notion
            const notionTaskWithThisId = notionTasks.find(t => t.motionTaskId === orphan.id);
            if (notionTaskWithThisId) {
              logger.info(`Clearing Motion ID from Notion task: ${notionTaskWithThisId.name}`);
              await notionClient.updateTask(notionTaskWithThisId.id, { motionTaskId: '' });
              
              // Clear from database too
              await database.pool.query(
                'UPDATE sync_tasks SET motion_task_id = NULL WHERE notion_page_id = $1',
                [notionTaskWithThisId.id]
              );
            }
            
            // Log deletion
            await database.logSync(notionTaskWithThisId?.id || null, orphan.id, 'orphan_deleted', {
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
  // Legacy method for backward compatibility
  async pollForChanges() {
    logger.warn('pollForChanges() is deprecated, using fastSync() + slowSync()');
    await this.fastSync();
    await this.slowSync();
  }
}

module.exports = new PollService();