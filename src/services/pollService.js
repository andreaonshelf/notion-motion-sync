const notionClient = require('./notionClient');
const motionClient = require('./motionClient');
const database = require('../database');
const logger = require('../utils/logger');
const TransactionWrapper = require('../database/transactionWrapper');

class PollService {
  constructor() {
    this.fastInterval = null;
    this.slowInterval = null;
    this.transactionWrapper = null;
  }
  
  // Initialize transaction wrapper when database is ready
  async initializeTransactions() {
    if (!this.transactionWrapper && database.pool) {
      this.transactionWrapper = new TransactionWrapper(database.pool);
    }
  }
  
  // Execute Motion operation with true database transaction atomicity
  async executeMotionOperation(operation, dbUpdate, rollback) {
    // Ensure transaction wrapper is initialized
    await this.initializeTransactions();
    
    // For backwards compatibility, support the old callback-style interface
    if (typeof dbUpdate === 'function') {
      return this.executeMotionOperationLegacy(operation, dbUpdate, rollback);
    }
    
    // New transaction-based approach
    const motionOperation = operation;
    const databaseOperations = dbUpdate; // Array of {query, params, notionPageId}
    
    return await this.transactionWrapper.executeWithTransaction(
      motionOperation,
      databaseOperations
    );
  }
  
  // Legacy executeMotionOperation for backwards compatibility
  async executeMotionOperationLegacy(operation, dbUpdate, rollback) {
    let operationResult = null;
    
    try {
      // Execute Motion operation
      operationResult = await operation();
      
      // Execute database update
      try {
        await dbUpdate(operationResult);
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
      
      // Step 2: Verify Motion ID consistency (Database ↔ Motion verification)
      await this.verifyMotionIdConsistency();
      
      // Step 3: Database → Notion (show Motion IDs and status updates)
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
      
      // Step 2: Sync completed Motion tasks to Notion
      await this.syncCompletedMotionTasks();
      
      // Step 3: Detect which tasks need Motion operations
      await this.detectMotionSyncNeeds();
      
      // Step 4: Process Motion operations (rate-limited)
      await this.processMotionOperations();
      
      // Step 5: Refresh Motion scheduling data AGAIN (catch just-created tasks)
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
      let mismatchCount = 0;
      
      for (const task of notionTasks) {
        const dbTask = await database.getMappingByNotionId(task.id);
        
        // Debug specific tasks to see what's being passed to database
        if (task.name.includes('Stress Test') || task.name.includes('Action Planning') || task.name.includes('Lets try once more')) {
          logger.info(`Database sync debug for "${task.name}":`, {
            taskSchedule: task.schedule,
            dataBeingPassedToDb: {
              name: task.name,
              schedule: task.schedule,
              status: task.status
            }
          });
        }

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
        
        // Check for Motion ID mismatches between Notion and Database
        const notionMotionId = task.motionTaskId || null;
        const dbMotionId = dbTask?.motion_task_id || null;
        
        if (notionMotionId !== dbMotionId) {
          mismatchCount++;
          logger.warn('Motion ID mismatch detected', {
            taskName: task.name,
            notionPageId: task.id,
            notionMotionId: notionMotionId || 'null',
            dbMotionId: dbMotionId || 'null',
            action: 'will_sync_from_database'
          });
          
          // Mark this task as needing Notion sync to push correct Motion ID
          await database.run(
            'UPDATE sync_tasks SET notion_sync_needed = true WHERE notion_page_id = $1',
            [task.id]
          );
        }
        
        updatedCount++;
      }
      
      logger.info(`Updated ${updatedCount} tasks in database`, {
        mismatchesFound: mismatchCount,
        mismatchesWillBeFixed: mismatchCount > 0
      });

      // CRITICAL: Detect deleted tasks - tasks in database but not in Notion
      await this.detectDeletedTasks(notionTasks);
      
    } catch (error) {
      logger.error('Error syncing Notion to database', { error: error.message });
    }
  }

  // Detect tasks that were deleted from Notion and clean them up
  async detectDeletedTasks(notionTasks) {
    try {
      // Get all tasks currently in database
      const dbTasks = await database.all('SELECT notion_page_id, notion_name, motion_task_id FROM sync_tasks');
      
      // Create set of current Notion task IDs for fast lookup
      const notionTaskIds = new Set(notionTasks.map(task => task.id));
      
      // Find database tasks that no longer exist in Notion
      const deletedTasks = dbTasks.filter(dbTask => !notionTaskIds.has(dbTask.notion_page_id));
      
      if (deletedTasks.length === 0) {
        return; // No deleted tasks
      }
      
      logger.info(`Found ${deletedTasks.length} tasks deleted from Notion`, {
        deletedTasks: deletedTasks.map(t => ({ name: t.notion_name, hasMotionId: !!t.motion_task_id }))
      });
      
      // Clean up deleted tasks
      for (const deletedTask of deletedTasks) {
        // If task had a Motion ID, delete from Motion first
        if (deletedTask.motion_task_id) {
          try {
            logger.info(`Deleting Motion task for deleted Notion task: ${deletedTask.notion_name}`, {
              motionId: deletedTask.motion_task_id
            });
            
            await motionClient.deleteTask(deletedTask.motion_task_id);
            
            logger.info(`Successfully deleted Motion task: ${deletedTask.notion_name}`);
          } catch (error) {
            logger.error(`Failed to delete Motion task for ${deletedTask.notion_name}`, {
              motionId: deletedTask.motion_task_id,
              error: error.message
            });
            // Continue with database cleanup even if Motion deletion fails
          }
        }
        
        // Remove from database
        await database.removeMapping(deletedTask.notion_page_id);
        
        // Log the deletion
        await database.logSync(
          deletedTask.notion_page_id, 
          deletedTask.motion_task_id, 
          'task_deleted', 
          { name: deletedTask.notion_name, trigger: 'notion_deletion_detected' }
        );
        
        logger.info(`Cleaned up deleted task: ${deletedTask.notion_name}`);
      }
      
    } catch (error) {
      logger.error('Error detecting deleted tasks', { error: error.message });
      // Don't throw - continue with normal sync
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
          // Build update payload - if no Motion ID, clear ALL Motion fields
          const updatePayload = {
            motionTaskId: task.motion_task_id || '',
            motionStartOn: task.motion_task_id ? task.motion_start_on : null,
            motionScheduledStart: task.motion_task_id ? task.motion_scheduled_start : null,
            motionScheduledEnd: task.motion_task_id ? task.motion_scheduled_end : null,
            motionStatus: task.motion_task_id ? task.motion_status_name : null,
            motionSchedulingIssue: task.motion_task_id ? task.motion_scheduling_issue : null,
            motionCompleted: task.motion_task_id ? task.motion_completed : null,
            motionDeadlineType: task.motion_task_id ? task.motion_deadline_type : null
          };
          
          logger.info(`Updating Notion task: ${task.notion_name}`, {
            pageId: task.notion_page_id,
            motionId: task.motion_task_id || 'CLEARING',
            hasMotionFields: !!task.motion_scheduled_start || !!task.motion_scheduled_end,
            updatePayload,
            isClearingPhantomId: !task.motion_task_id && updatePayload.motionTaskId === ''
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
      // Get larger batch of tasks to process - don't let any slip through
      const tasksToProcess = await database.getMotionTasksToProcess(20);
      
      if (tasksToProcess.length === 0) {
        logger.debug('No Motion operations needed');
        return;
      }
      
      logger.info(`Processing ${tasksToProcess.length} Motion operations`);
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const task of tasksToProcess) {
        try {
          logger.info(`Starting Motion operation for: ${task.notion_name}`, {
            operation: task.schedule_checkbox ? (task.motion_task_id ? 'UPDATE' : 'CREATE') : 'DELETE',
            scheduled: task.schedule_checkbox,
            hasMotionId: !!task.motion_task_id,
            status: task.status
          });
          
          await this.processMotionTask(task);
          successCount++;
          
          logger.info(`✅ Completed Motion operation for: ${task.notion_name}`);
          
          // Rate limit between Motion API calls (1 second to be faster)
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          errorCount++;
          logger.error(`❌ Failed Motion operation for: ${task.notion_name}`, {
            error: error.message,
            statusCode: error.response?.status,
            operation: task.schedule_checkbox ? (task.motion_task_id ? 'UPDATE' : 'CREATE') : 'DELETE',
            willRetry: true
          });
          
          // Mark task as failed so it gets retried in next cycle
          await database.pool.query(
            'UPDATE sync_tasks SET motion_last_attempt = CURRENT_TIMESTAMP WHERE notion_page_id = $1',
            [task.notion_page_id]
          );
          
          // Handle specific error types for better recovery
          if (error.response?.status === 429) {
            logger.warn('Motion API rate limited, will retry with delay');
            await database.pool.query(
              'UPDATE sync_tasks SET motion_last_attempt = CURRENT_TIMESTAMP + INTERVAL \'5 minutes\' WHERE notion_page_id = $1',
              [task.notion_page_id]
            );
          } else if (error.response?.status === 404 && task.motion_task_id) {
            logger.warn('Motion task not found, clearing phantom ID for recreation');
            await database.pool.query(
              `UPDATE sync_tasks 
               SET motion_task_id = NULL,
                   motion_sync_needed = true,
                   motion_priority = 1,
                   motion_last_attempt = NULL
               WHERE notion_page_id = $1`,
              [task.notion_page_id]
            );
          }
          
          // Continue processing other tasks even if one fails
          continue;
        }
      }
      
      logger.info(`Motion operations completed: ${successCount} success, ${errorCount} errors`);
      
    } catch (error) {
      logger.error('Error processing Motion operations', { error: error.message });
    }
  }

  // Process a single Motion task operation
  async processMotionTask(task) {
    const isScheduled = task.schedule_checkbox;
    const hasMotionId = !!task.motion_task_id;
    const isCompleted = task.status === 'Done';
    
    if (isScheduled && !hasMotionId && !isCompleted) {
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
        // Remove startOn - Motion API handles via autoScheduled
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
      
    } else if (isScheduled && hasMotionId && !isCompleted) {
      // UPDATE: Existing Motion task
      logger.info(`Updating Motion task: ${task.notion_name}`);
      
      const updateData = {
        name: task.notion_name,
        duration: task.duration,
        dueDate: task.due_date
        // Remove startOn - Motion API handles via autoScheduled
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
      
    } else if ((!isScheduled || isCompleted) && hasMotionId) {
      // DELETE: Unscheduled task OR completed task with Motion ID
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
      
      // Get all tasks that SHOULD be in Motion (scheduled = true AND not completed)
      const shouldBeInMotion = await database.all(
        'SELECT notion_name, motion_task_id FROM sync_tasks WHERE schedule_checkbox = true AND status != \'Done\''
      );
      
      // Only consider Motion IDs that we know about (not phantom/stale ones)
      const knownMotionIds = new Set(
        shouldBeInMotion
          .filter(t => t.motion_task_id) // Has a Motion ID
          .map(t => t.motion_task_id)
      );
      
      logger.info(`Found ${shouldBeInMotion.length} tasks that should be in Motion`, {
        withMotionIds: knownMotionIds.size,
        knownIds: Array.from(knownMotionIds),
        scheduledTaskNames: shouldBeInMotion.map(t => `${t.notion_name} (${t.motion_task_id || 'NO_ID'})`)
      });
      
      logger.info(`Found ${motionTasks.length} tasks in Motion`, {
        motionTaskNames: motionTasks.map(t => `${t.name} (${t.id})`)
      });
      
      // Find orphaned Motion tasks: exist in Motion but database doesn't know about them
      // Database is the authority - if it doesn't have the Motion ID, the Motion task shouldn't exist
      const orphanedTasks = motionTasks.filter(motionTask => {
        // Does ANY database record have this exact Motion ID?
        const hasDbRecord = shouldBeInMotion.some(dbTask => dbTask.motion_task_id === motionTask.id);
        
        if (hasDbRecord) {
          logger.debug(`Motion task ${motionTask.name} (${motionTask.id}) found in database - NOT orphaned`);
          return false;
        }
        
        // Database has no record of this Motion ID - it's orphaned and should be deleted
        logger.warn(`Motion task ${motionTask.name} (${motionTask.id}) not found in database - ORPHANED`, {
          reason: 'database_has_no_record_of_this_motion_id',
          scheduledTasksInDb: shouldBeInMotion.length,
          motionIdsInDb: shouldBeInMotion.filter(t => t.motion_task_id).map(t => t.motion_task_id)
        });
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
        const age = Math.round((Date.now() - new Date(orphan.createdTime).getTime()) / 60000);
        
        // Use atomic Motion operation with database update
        await this.executeMotionOperation(
          // Motion operation: Delete the orphaned task
          async () => {
            logger.info(`Deleting truly orphaned Motion task: ${orphan.name}`, {
              id: orphan.id,
              age: `${age} minutes`,
              reason: 'no_corresponding_scheduled_task'
            });
            
            await motionClient.deleteTask(orphan.id);
            return orphan.id;
          },
          // Database update: Clear any references to this Motion ID
          async (deletedMotionId) => {
            // Clear Motion ID from any database records that reference it
            const result = await database.pool.query(
              `UPDATE sync_tasks 
               SET motion_task_id = NULL, 
                   motion_sync_needed = CASE 
                     WHEN schedule_checkbox = true THEN true 
                     ELSE false 
                   END,
                   notion_sync_needed = true 
               WHERE motion_task_id = $1`,
              [deletedMotionId]
            );
            
            logger.info(`Cleared Motion ID ${deletedMotionId} from ${result.rowCount} database records`);
            
            // Log the cleanup action
            await database.logSync(null, deletedMotionId, 'orphan_cleanup', {
              name: orphan.name,
              age: `${age} minutes`,
              action: 'deleted_truly_orphaned_motion_task',
              affectedRows: result.rowCount
            });
          },
          // Rollback: Try to recreate the Motion task if database update fails
          async (deletedMotionId) => {
            logger.error(`Database update failed after deleting Motion task ${orphan.name}`, {
              motionId: deletedMotionId,
              action: 'attempting_rollback'
            });
            
            // Note: We can't truly rollback a deleted Motion task, but we can log the issue
            await database.logSync(null, deletedMotionId, 'orphan_cleanup_failed', {
              name: orphan.name,
              error: 'database_update_failed_after_deletion',
              action: 'manual_intervention_required'
            });
          }
        );
        
        // Rate limit between atomic operations
        await new Promise(resolve => setTimeout(resolve, 2000));
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

  // Sync completed Motion tasks to Notion
  async syncCompletedMotionTasks() {
    try {
      logger.info('Checking for completed Motion tasks...');
      
      // Get completed Motion tasks using status=Completed parameter
      const motionClient = require('./motionClient');
      const axios = require('axios');
      const { config } = require('../config');
      
      const client = axios.create({
        baseURL: config.motion.apiUrl,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.motion.apiKey
        }
      });
      
      // Fetch completed tasks from Motion
      const completedResponse = await client.get('/tasks', { 
        params: { status: 'Completed' } 
      });
      
      const completedMotionTasks = completedResponse.data.tasks || [];
      
      if (completedMotionTasks.length === 0) {
        logger.debug('No completed Motion tasks found');
        return;
      }
      
      logger.info(`Found ${completedMotionTasks.length} completed Motion tasks`);
      
      // Check which completed tasks exist in our database
      let syncedCount = 0;
      
      for (const motionTask of completedMotionTasks) {
        try {
          // Find corresponding database record
          const dbTask = await database.get(`
            SELECT notion_page_id, notion_name, status 
            FROM sync_tasks 
            WHERE motion_task_id = $1
          `, [motionTask.id]);
          
          if (dbTask) {
            // Update Motion fields in database
            await database.updateMotionFields(dbTask.notion_page_id, motionTask);
            
            // Update task status to completed in database if not already
            if (dbTask.status !== 'Done') {
              await database.run(`
                UPDATE sync_tasks 
                SET status = 'Done', 
                    notion_sync_needed = true,
                    motion_completed = true,
                    motion_completed_time = $1
                WHERE notion_page_id = $2
              `, [motionTask.completedTime, dbTask.notion_page_id]);
              
              syncedCount++;
              logger.info(`Marked task as completed: ${dbTask.notion_name}`, {
                notionPageId: dbTask.notion_page_id,
                motionTaskId: motionTask.id,
                completedTime: motionTask.completedTime
              });
            }
          } else {
            logger.debug(`Completed Motion task not in database: ${motionTask.name} (${motionTask.id})`);
          }
          
        } catch (error) {
          logger.error(`Error processing completed task ${motionTask.name}`, { 
            error: error.message,
            motionTaskId: motionTask.id 
          });
        }
      }
      
      if (syncedCount > 0) {
        logger.info(`Synced ${syncedCount} completed tasks from Motion`);
      }
      
    } catch (error) {
      logger.error('Error syncing completed Motion tasks', { error: error.message });
    }
  }

  // Verify Motion ID consistency: Database Motion IDs must exist in Motion
  async verifyMotionIdConsistency() {
    try {
      // TEMPORARILY DISABLED - causing rate limit issues
      // Only run verification once per hour to reduce API calls
      const now = Date.now();
      if (!this.lastVerification || (now - this.lastVerification) < 3600000) {
        logger.debug('Skipping Motion ID verification to avoid rate limits');
        return;
      }
      this.lastVerification = now;
      
      logger.debug('Verifying Motion ID consistency...');
      
      // Get all database records with Motion IDs
      const tasksWithMotionIds = await database.all(`
        SELECT notion_page_id, notion_name, motion_task_id 
        FROM sync_tasks 
        WHERE motion_task_id IS NOT NULL
      `);
      
      if (tasksWithMotionIds.length === 0) {
        logger.debug('No Motion IDs in database to verify');
        return;
      }
      
      logger.info(`Verifying ${tasksWithMotionIds.length} Motion IDs exist in Motion`);
      
      let invalidCount = 0;
      for (const dbTask of tasksWithMotionIds) {
        try {
          // Check if Motion task actually exists
          await motionClient.getTask(dbTask.motion_task_id);
          // Task exists - Motion ID is valid
          
        } catch (error) {
          if (error.response?.status === 404) {
            // Motion task doesn't exist - clear invalid Motion ID from database
            invalidCount++;
            logger.warn(`Invalid Motion ID in database - clearing: ${dbTask.notion_name}`, {
              motionId: dbTask.motion_task_id,
              reason: 'motion_task_not_found'
            });
            
            // Clear the invalid Motion ID atomically
            await database.run(`
              UPDATE sync_tasks 
              SET motion_task_id = NULL,
                  motion_scheduled_start = NULL,
                  motion_scheduled_end = NULL,
                  motion_status_name = NULL,
                  motion_scheduling_issue = NULL,
                  motion_completed = NULL,
                  motion_deadline_type = NULL,
                  motion_start_on = NULL,
                  motion_sync_needed = CASE 
                    WHEN schedule_checkbox = true THEN true 
                    ELSE false 
                  END,
                  notion_sync_needed = true
              WHERE notion_page_id = $1
            `, [dbTask.notion_page_id]);
            
            // Log the correction
            await database.logSync(dbTask.notion_page_id, dbTask.motion_task_id, 'invalid_motion_id_cleared', {
              taskName: dbTask.notion_name,
              reason: 'motion_task_404_not_found'
            });
            
          } else {
            logger.error(`Error verifying Motion task: ${dbTask.notion_name}`, {
              motionId: dbTask.motion_task_id,
              error: error.message
            });
          }
        }
        
        // Rate limit to avoid overwhelming Motion API
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (invalidCount > 0) {
        logger.info(`Cleared ${invalidCount} invalid Motion IDs from database`);
      }
      
    } catch (error) {
      logger.error('Error during Motion ID verification', { error: error.message });
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