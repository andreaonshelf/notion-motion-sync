const notionClient = require('./notionClient');
const motionClient = require('./motionClient');
const database = require('../database');
const logger = require('../utils/logger');

class PollService {
  constructor() {
    this.fastInterval = null;
    this.slowInterval = null;
  }
  
  // Execute Motion operation with database update atomically
  async executeMotionOperation(operation, dbUpdate, rollback) {
    let operationResult = null;
    let dbUpdated = false;
    
    try {
      // Execute Motion operation
      operationResult = await operation();
      
      // Execute database update
      try {
        await dbUpdate(operationResult);
        dbUpdated = true;
      } catch (dbError) {
        // Motion operation succeeded but DB update failed - CRITICAL
        logger.error('CRITICAL: Motion operation succeeded but database update failed', {
          operationResult,
          error: dbError.message
        });
        
        // Attempt rollback if provided
        if (rollback && operationResult) {
          try {
            await rollback(operationResult);
            logger.info('Rollback successful');
          } catch (rollbackError) {
            logger.error('Rollback failed - manual intervention required', {
              rollbackError: rollbackError.message,
              operationResult
            });
          }
        }
        
        throw dbError;
      }
      
      return operationResult;
      
    } catch (error) {
      // If operation failed, nothing to rollback
      throw error;
    }
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
      
      // Step 1: Refresh Motion scheduling data FIRST (catch recently created tasks)
      await this.refreshMotionSchedulingData();
      
      // Step 2: Detect which tasks need Motion operations
      await this.detectMotionSyncNeeds();
      
      // Step 3: Process Motion operations (rate-limited)
      await this.processMotionOperations();
      
      // Step 4: Refresh Motion scheduling data AGAIN (catch just-created tasks)
      await this.refreshMotionSchedulingData();
      
      // Step 5: Clean up orphaned Motion tasks
      await this.cleanupOrphanedMotionTasks();
      
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
          status: task.status,
          priority: task.priority,
          startOn: task.startOn
        });
        
        // NEVER import Motion IDs from Notion - they only flow Motion → Database → Notion
        // Motion IDs are only set by Motion API responses, never from Notion data
        
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
          // Log what we're about to send
          const updatePayload = {
            motionTaskId: task.motion_task_id || '',
            motionStartOn: task.motion_start_on,
            motionScheduledStart: task.motion_scheduled_start,
            motionScheduledEnd: task.motion_scheduled_end,
            motionStatus: task.motion_status_name,
            motionSchedulingIssue: task.motion_scheduling_issue,
            motionCompleted: task.motion_completed,
            motionDeadlineType: task.motion_deadline_type
          };
          
          logger.info(`Updating Notion task: ${task.notion_name}`, {
            pageId: task.notion_page_id,
            motionId: task.motion_task_id,
            hasMotionFields: !!task.motion_scheduled_start || !!task.motion_scheduled_end,
            updatePayload
          });
          
          // Update Notion with Motion fields from database
          await notionClient.updateTask(task.notion_page_id, updatePayload);
          
          // Only mark as completed AFTER successful Notion update
          await database.completeNotionSync(task.notion_page_id);
          
          logger.info(`Successfully updated Notion task: ${task.notion_name}`, {
            motionId: task.motion_task_id
          });
          
          // Rate limit
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (error) {
          logger.error(`Failed to update Notion task: ${task.notion_name}`, {
            pageId: task.notion_page_id,
            error: error.message,
            willRetry: true
          });
          // Don't mark as synced - keep notion_sync_needed = true for retry
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
            error: error.message,
            statusCode: error.response?.status,
            operation: task.schedule_checkbox ? (task.motion_task_id ? 'UPDATE' : 'CREATE') : 'DELETE'
          });
          
          // Handle different error types
          if (error.response?.status === 429) {
            // Rate limited - wait longer before retry
            logger.warn('Motion API rate limited, extending retry delay');
            await database.pool.query(
              'UPDATE sync_tasks SET motion_last_attempt = CURRENT_TIMESTAMP + INTERVAL \'10 minutes\' WHERE notion_page_id = $1',
              [task.notion_page_id]
            );
          } else if (error.response?.status === 404 && task.motion_task_id) {
            // Motion task doesn't exist - clear the phantom ID and mark for immediate retry
            logger.warn('Motion task not found, clearing phantom ID and marking for recreation', { 
              motionTaskId: task.motion_task_id,
              taskName: task.notion_name
            });
            // Clear the phantom ID and reset for immediate recreation
            await database.pool.query(
              `UPDATE sync_tasks 
               SET motion_task_id = NULL,
                   motion_sync_needed = true,
                   motion_priority = 1,
                   motion_last_attempt = NULL,
                   sync_status = 'pending',
                   notion_sync_needed = true
               WHERE notion_page_id = $1`,
              [task.notion_page_id]
            );
          } else if (error.response?.status >= 500) {
            // Server error - retry with exponential backoff
            logger.warn('Motion API server error, will retry with backoff');
            await database.pool.query(
              'UPDATE sync_tasks SET motion_last_attempt = CURRENT_TIMESTAMP + INTERVAL \'5 minutes\' WHERE notion_page_id = $1',
              [task.notion_page_id]
            );
          } else {
            // Other errors - normal retry
            await database.pool.query(
              'UPDATE sync_tasks SET motion_last_attempt = CURRENT_TIMESTAMP WHERE notion_page_id = $1',
              [task.notion_page_id]
            );
          }
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
      // CREATE: New scheduled task - but first check if it already exists
      logger.info(`Checking if Motion task already exists: ${task.notion_name}`);
      
      // Check if Motion already has this task (by name)
      try {
        const existingTasks = await motionClient.listTasks();
        const existingTask = existingTasks.tasks.find(t => 
          t.name.toLowerCase().trim() === task.notion_name.toLowerCase().trim()
        );
        
        if (existingTask) {
          logger.info(`Found existing Motion task, reconnecting: ${task.notion_name}`, {
            existingMotionId: existingTask.id
          });
          
          // Reconnect to existing Motion task instead of creating duplicate
          await database.completeMotionSync(task.notion_page_id, existingTask.id);
          
          // Update Motion fields
          await database.updateMotionFields(task.notion_page_id, existingTask);
          
          return;
        }
      } catch (error) {
        logger.warn('Error checking for existing Motion tasks', { error: error.message });
        // Continue with creation if check fails
      }
      
      logger.info(`Creating new Motion task: ${task.notion_name}`);
      
      const motionTaskData = {
        name: task.notion_name,
        duration: task.duration,
        dueDate: task.due_date,
        startOn: task.start_on,
        status: 'Not started',
        priority: task.priority
      };
      
      // Create Motion task with atomic database update
      const motionTask = await this.executeMotionOperation(
        // Motion operation
        async () => {
          const created = await motionClient.createTask(motionTaskData);
          
          // Verify task was created
          let verificationRetries = 3;
          let taskVerified = false;
          
          while (verificationRetries > 0 && !taskVerified) {
            try {
              await motionClient.getTask(created.id);
              taskVerified = true;
            } catch (verifyError) {
              verificationRetries--;
              if (verificationRetries > 0) {
                logger.warn(`Task verification failed, retrying...`, {
                  motionTaskId: created.id,
                  attemptsLeft: verificationRetries
                });
                await new Promise(resolve => setTimeout(resolve, 2000));
              } else {
                throw new Error(`Task verification failed: ${verifyError.message}`);
              }
            }
          }
          
          return created;
        },
        // Database update
        async (created) => {
          await database.completeMotionSync(task.notion_page_id, created.id);
        },
        // Rollback (delete Motion task if DB update fails)
        async (created) => {
          logger.warn('Attempting to delete Motion task due to DB failure', {
            motionId: created.id
          });
          await motionClient.deleteTask(created.id);
        }
      );
      
      // Try to get initial scheduling data (might be null)
      try {
        const fullMotionTask = await motionClient.getTask(motionTask.id);
        await database.updateMotionFields(task.notion_page_id, fullMotionTask);
        
        if (!fullMotionTask.scheduledStart) {
          // Motion hasn't scheduled it yet - mark for later refresh
          logger.info(`Motion task created but not yet scheduled: ${task.notion_name}`, { 
            motionId: motionTask.id,
            willCheckAgain: true
          });
          // Mark task as needing scheduling refresh
          await database.run(
            'UPDATE sync_tasks SET needs_scheduling_refresh = true WHERE notion_page_id = $1',
            [task.notion_page_id]
          );
        } else {
          logger.info(`Motion task created and scheduled: ${task.notion_name}`, { 
            motionId: motionTask.id,
            scheduledStart: fullMotionTask.scheduledStart,
            scheduledEnd: fullMotionTask.scheduledEnd
          });
        }
      } catch (error) {
        logger.warn(`Created Motion task but couldn't fetch details: ${error.message}`);
      }
      
    } else if (isScheduled && hasMotionId) {
      // UPDATE: Existing Motion task
      logger.info(`Updating Motion task: ${task.notion_name}`);
      
      const updateData = {
        name: task.notion_name,
        duration: task.duration,
        dueDate: task.due_date,
        startOn: task.start_on
      };
      
      // Only add priority if it exists
      if (task.priority) {
        updateData.priority = task.priority;
      }
      
      // Update Motion task with atomic database update
      await this.executeMotionOperation(
        // Motion operation
        async () => {
          await motionClient.updateTask(task.motion_task_id, updateData);
          return task.motion_task_id;
        },
        // Database update
        async () => {
          await database.completeMotionSync(task.notion_page_id, task.motion_task_id);
        },
        // No rollback for updates - can't undo Motion update
        null
      );
      
      // Fetch updated task details and update Motion fields
      try {
        const fullMotionTask = await motionClient.getTask(task.motion_task_id);
        await database.updateMotionFields(task.notion_page_id, fullMotionTask);
        logger.info(`Motion task updated and fields stored: ${task.notion_name}`, { 
          scheduledStart: fullMotionTask.scheduledStart,
          scheduledEnd: fullMotionTask.scheduledEnd
        });
      } catch (error) {
        logger.warn(`Updated Motion task but couldn't fetch details: ${error.message}`);
      }
      
    } else if (!isScheduled && hasMotionId) {
      // DELETE: Unscheduled task with Motion ID
      logger.info(`Deleting Motion task: ${task.notion_name}`);
      
      // Delete Motion task with atomic database update
      await this.executeMotionOperation(
        // Motion operation
        async () => {
          await motionClient.deleteTask(task.motion_task_id);
          return task.motion_task_id;
        },
        // Database update
        async () => {
          await database.completeMotionSync(task.notion_page_id, null);
        },
        // Rollback - check if task was actually deleted
        async (motionId) => {
          try {
            await motionClient.getTask(motionId);
            // Task still exists, deletion may have failed
            logger.error('Motion task still exists after delete attempt', {
              motionId
            });
          } catch (checkError) {
            if (checkError.response?.status === 404) {
              // Task is gone, try to update DB again
              logger.info('Motion task confirmed deleted, retrying DB update');
              await database.completeMotionSync(task.notion_page_id, null);
            }
          }
        }
      );
      
      logger.info(`Motion task deleted: ${task.notion_name}`);
      
    } else {
      // No operation needed
      await database.completeMotionSync(task.notion_page_id, task.motion_task_id);
    }
  }

  // Clean up orphaned Motion tasks
  async cleanupOrphanedMotionTasks() {
    try {
      logger.info('Cleaning up orphaned Motion tasks...');
      
      // Get all Motion tasks
      const motionResponse = await motionClient.listTasks();
      const motionTasks = motionResponse.tasks || [];
      
      if (motionTasks.length === 0) {
        logger.warn('Motion API returned 0 tasks - this might be an API issue, not clearing Motion IDs');
        return;
      }
      
      // Get all tasks that SHOULD be in Motion (schedule_checkbox = true)
      const shouldBeInMotion = await database.all(
        'SELECT notion_name, motion_task_id FROM sync_tasks WHERE schedule_checkbox = true'
      );
      
      // Only consider Motion IDs that we know about (not phantom/stale ones)
      const knownMotionIds = new Set(
        shouldBeInMotion
          .filter(t => t.motion_task_id) // Has a Motion ID
          .map(t => t.motion_task_id)
      );
      
      logger.info(`Found ${shouldBeInMotion.length} tasks that should be in Motion`, {
        withMotionIds: knownMotionIds.size,
        knownIds: Array.from(knownMotionIds)
      });
      
      // Find truly orphaned Motion tasks: exist in Motion but should NOT be scheduled
      // (Motion tasks that exist but we have no record of them being scheduled)
      const orphanedTasks = motionTasks.filter(task => {
        // If we know about this Motion ID, it's not orphaned
        if (knownMotionIds.has(task.id)) {
          return false;
        }
        
        // If we have ANY scheduled task without a Motion ID, this could be for that task
        // So don't delete it - let the sync process handle it
        const hasUnmatchedScheduledTasks = shouldBeInMotion.some(t => !t.motion_task_id);
        if (hasUnmatchedScheduledTasks) {
          return false;
        }
        
        // Only delete if we're confident it's truly orphaned
        return true;
      });
      
      // Apply 2-minute safety buffer - only delete tasks older than 2 minutes
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      const safeOrphans = orphanedTasks.filter(task => {
        const taskTime = new Date(task.createdTime || task.updatedTime);
        return taskTime < twoMinutesAgo;
      });
      
      if (safeOrphans.length === 0) {
        logger.info(`Found ${orphanedTasks.length} orphaned tasks, but none older than 2 minutes`);
        return;
      }
      
      logger.info(`Cleaning up ${safeOrphans.length} orphaned Motion tasks (older than 2 minutes)`);
      
      for (const orphan of safeOrphans) {
        try {
          const age = Math.round((Date.now() - new Date(orphan.createdTime).getTime()) / 60000);
          logger.info(`Deleting orphaned Motion task: ${orphan.name}`, {
            id: orphan.id,
            age: `${age} minutes`
          });
          
          // Delete from Motion
          await motionClient.deleteTask(orphan.id);
          
          // Immediately clear the Motion ID from database and mark for recreation
          await database.pool.query(
            `UPDATE sync_tasks 
             SET motion_task_id = NULL, 
                 motion_sync_needed = true,
                 motion_priority = 1,
                 notion_sync_needed = true 
             WHERE motion_task_id = $1`,
            [orphan.id]
          );
          
          logger.info(`Cleared Motion ID ${orphan.id} from database after deletion`);
          
          // Log cleanup
          await database.logSync(null, orphan.id, 'orphan_cleanup', {
            name: orphan.name,
            age: `${age} minutes`,
            action: 'deleted_motion_and_cleared_database'
          });
          
          // Rate limit between deletions
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          logger.error(`Failed to delete orphaned Motion task: ${orphan.name}`, {
            error: error.message
          });
        }
      }
      
      logger.info(`Cleanup completed: deleted ${safeOrphans.length} orphaned Motion tasks`);
      
      // SECOND CLEANUP: Clear phantom Motion IDs from database
      // (Motion IDs that exist in database but not in Motion)
      const dbTasksWithMotionIds = await database.all(
        'SELECT notion_page_id, notion_name, motion_task_id FROM sync_tasks WHERE motion_task_id IS NOT NULL'
      );
      
      const actualMotionIds = new Set(motionTasks.map(t => t.id));
      const phantomTasks = dbTasksWithMotionIds.filter(t => !actualMotionIds.has(t.motion_task_id));
      
      if (phantomTasks.length > 0) {
        logger.info(`Found ${phantomTasks.length} phantom Motion IDs in database`);
        
        for (const phantom of phantomTasks) {
          logger.info(`Clearing phantom Motion ID for: ${phantom.notion_name}`, {
            phantomId: phantom.motion_task_id
          });
          
          // Clear the phantom Motion ID and mark for recreation if scheduled
          await database.pool.query(
            `UPDATE sync_tasks 
             SET motion_task_id = NULL,
                 motion_sync_needed = CASE 
                   WHEN schedule_checkbox = true THEN true 
                   ELSE motion_sync_needed 
                 END,
                 motion_priority = CASE 
                   WHEN schedule_checkbox = true THEN 1 
                   ELSE motion_priority 
                 END,
                 notion_sync_needed = true
             WHERE notion_page_id = $1`,
            [phantom.notion_page_id]
          );
          
          await database.logSync(phantom.notion_page_id, phantom.motion_task_id, 'phantom_cleanup', {
            name: phantom.notion_name,
            action: 'cleared_phantom_motion_id'
          });
        }
        
        logger.info(`Cleared ${phantomTasks.length} phantom Motion IDs from database`);
      }
      
    } catch (error) {
      logger.error('Error during Motion cleanup', { error: error.message });
    }
  }
  
  // Refresh Motion scheduling data for tasks that Motion may have auto-scheduled
  async refreshMotionSchedulingData() {
    try {
      logger.info('Checking for Motion scheduling updates...');
      
      // Check both: tasks without scheduling AND tasks marked for refresh
      const unscheduledTasks = await database.all(`
        SELECT notion_page_id, notion_name, motion_task_id 
        FROM sync_tasks 
        WHERE motion_task_id IS NOT NULL 
        AND schedule_checkbox = true
        AND (
          motion_scheduled_start IS NULL
          OR needs_scheduling_refresh = true
        )
      `);
      
      if (unscheduledTasks.length === 0) {
        return;
      }
      
      logger.info(`Found ${unscheduledTasks.length} tasks to check for scheduling updates`);
      
      let updatedCount = 0;
      for (const task of unscheduledTasks) {
        try {
          const motionTask = await motionClient.getTask(task.motion_task_id);
          
          if (motionTask.scheduledStart || motionTask.scheduledEnd) {
            await database.updateMotionFields(task.notion_page_id, motionTask);
            // Clear the refresh flag
            await database.run(
              'UPDATE sync_tasks SET needs_scheduling_refresh = false WHERE notion_page_id = $1',
              [task.notion_page_id]
            );
            updatedCount++;
            logger.info(`Updated scheduling for: ${task.notion_name}`, {
              scheduledStart: motionTask.scheduledStart,
              scheduledEnd: motionTask.scheduledEnd
            });
          }
        } catch (error) {
          if (error.response?.status === 404) {
            logger.warn(`Motion task not found for: ${task.notion_name}`, {
              motionId: task.motion_task_id
            });
          } else {
            logger.error(`Error checking Motion task: ${task.notion_name}`, {
              error: error.message
            });
          }
        }
      }
      
      if (updatedCount > 0) {
        logger.info(`Updated scheduling data for ${updatedCount} tasks`);
      }
      
    } catch (error) {
      logger.error('Error refreshing Motion scheduling data', { error: error.message });
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