const motionClient = require('./motionClient');
const notionClient = require('./notionClient');
const mappingCache = require('./mappingCache');
const logger = require('../utils/logger');

class SyncService {
  constructor() {
    this.syncInProgress = new Set();
  }

  async syncNotionToMotion(notionPageId) {
    if (this.syncInProgress.has(notionPageId)) {
      logger.warn('Sync already in progress for Notion page', { notionPageId });
      return;
    }

    this.syncInProgress.add(notionPageId);
    
    try {
      const notionTask = await notionClient.getTask(notionPageId);
      
      if (notionTask.motionTaskId) {
        const enhancedDescription = this.enhanceDescriptionWithAttachments(notionTask);
        const motionTask = await motionClient.updateTask(notionTask.motionTaskId, {
          name: notionTask.name,
          description: enhancedDescription,
          status: notionTask.status,
          priority: notionTask.priority,
          dueDate: notionTask.dueDate,
          duration: notionTask.duration
        });
        
        // Ensure mapping is cached
        await mappingCache.setMapping(notionPageId, notionTask.motionTaskId);
        
        logger.info('Updated Motion task from Notion', { 
          notionPageId, 
          motionTaskId: motionTask.id 
        });
      } else {
        // No Motion ID stored in Notion, create new task
        const enhancedDescription = this.enhanceDescriptionWithAttachments(notionTask);
        const motionTask = await motionClient.createTask({
          name: notionTask.name,
          description: enhancedDescription,
          status: notionTask.status,
          priority: notionTask.priority,
          dueDate: notionTask.dueDate,
          duration: notionTask.duration
        });
        
        await notionClient.updateTask(notionPageId, {
          motionTaskId: motionTask.id
        });
        
        // Cache the mapping
        await mappingCache.setMapping(notionPageId, motionTask.id);
        
        logger.info('Created Motion task from Notion', { 
          notionPageId, 
          motionTaskId: motionTask.id 
        });
      }
    } catch (error) {
      logger.error('Error syncing Notion to Motion', { 
        notionPageId, 
        error: error.message 
      });
      throw error;
    } finally {
      this.syncInProgress.delete(notionPageId);
    }
  }

  async syncMotionToNotion(motionTaskId) {
    if (this.syncInProgress.has(motionTaskId)) {
      logger.warn('Sync already in progress for Motion task', { motionTaskId });
      return;
    }

    this.syncInProgress.add(motionTaskId);
    
    try {
      const motionTask = await motionClient.getTask(motionTaskId);
      
      const notionTasks = await notionClient.queryDatabase({
        property: 'Motion Task ID',
        rich_text: {
          equals: motionTaskId
        }
      });
      
      const taskData = {
        name: motionTask.name,
        description: motionTask.description || '',
        status: this.mapMotionStatusToNotion(motionTask.status?.name || motionTask.status),
        priority: this.mapMotionPriorityToNotion(motionTask.priority),
        dueDate: motionTask.dueDate,
        duration: motionTask.duration || null,
        motionTaskId: motionTaskId
      };
      
      if (notionTasks.length > 0) {
        const notionPageId = notionTasks[0].id;
        logger.info('Found existing Notion task, updating...', {
          motionTaskId,
          notionPageId,
          existingName: notionTasks[0].name
        });
        await notionClient.updateTask(notionPageId, taskData);
        
        // Ensure mapping is cached
        await mappingCache.setMapping(notionPageId, motionTaskId);
        
        logger.info('Updated Notion task from Motion', { 
          motionTaskId, 
          notionPageId 
        });
      } else {
        // Don't create in Notion - this Motion task has no Notion counterpart
        logger.info('Motion task has no Notion counterpart - will be deleted in next poll cycle', {
          motionTaskId,
          taskName: taskData.name
        });
        // Do NOT create in Notion - let the deletion logic handle it
      }
    } catch (error) {
      logger.error('Error syncing Motion to Notion', { 
        motionTaskId, 
        error: error.message 
      });
      throw error;
    } finally {
      this.syncInProgress.delete(motionTaskId);
    }
  }

  mapMotionStatusToNotion(motionStatus) {
    const statusMap = {
      'Todo': 'Not started',
      'In Progress': 'In progress',
      'Completed': 'Done',
      'Canceled': 'Archived',
      'Backlog': 'Not started',
      'Blocked': 'Not started'
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

  async performFullSync() {
    try {
      logger.info('Starting full sync using database approach');
      
      // Just trigger the poll service methods which use the database
      const pollService = require('./pollService');
      
      // Update Notion data in database
      await pollService.updateNotionData();
      
      // Sync only changed tasks
      await pollService.syncChangedTasks();
      
      // Clean up orphaned Motion tasks
      await pollService.cleanupOrphanedMotionTasks();
      
      logger.info('Full sync completed using smart sync');
    } catch (error) {
      logger.error('Error during full sync', { error: error.message });
      throw error;
    }
  }

  async syncAllMotionTasks() {
    try {
      logger.info('Starting Motion to Notion sync using database approach');
      
      // Just trigger the poll service methods which use the database
      const pollService = require('./pollService');
      
      // Update Notion data in database
      await pollService.updateNotionData();
      
      // Sync only changed tasks
      await pollService.syncChangedTasks();
      
      // Clean up orphaned Motion tasks
      await pollService.cleanupOrphanedMotionTasks();
      
      logger.info('Motion to Notion sync completed using smart sync');
    } catch (error) {
      logger.error('Error during Motion to Notion sync', { error: error.message });
      throw error;
    }
  }

  enhanceDescriptionWithAttachments(notionTask) {
    let description = notionTask.description || '';
    
    // Add attachment indicator if files exist in Notion
    if (notionTask.hasAttachments && notionTask.url) {
      // Add spacing if description exists
      if (description) {
        description += '\n\n';
      }
      
      // Add mobile-friendly attachment section
      description += '📎 Documents in Notion\n';
      description += '👉 ' + notionTask.url;
    }
    
    return description;
  }

  async handleNotionDeletion(notionPageId, motionTaskId) {
    try {
      logger.info('Handling Notion page deletion', { notionPageId, motionTaskId });
      
      // If Motion task ID not provided, try to get it from cache
      if (!motionTaskId) {
        motionTaskId = await mappingCache.getMotionId(notionPageId);
        if (motionTaskId) {
          logger.info('Retrieved Motion task ID from cache', { notionPageId, motionTaskId });
        }
      }
      
      if (motionTaskId) {
        // Delete the corresponding Motion task
        await motionClient.deleteTask(motionTaskId);
        
        // Remove from cache
        await mappingCache.removeByNotionId(notionPageId);
        
        logger.info('Notion page deleted - Motion task also deleted', { 
          notionPageId, 
          motionTaskId 
        });
      } else {
        logger.warn('Notion page deleted but no Motion task ID found in webhook or cache', { notionPageId });
      }
    } catch (error) {
      logger.error('Error handling Notion deletion', { 
        notionPageId, 
        motionTaskId,
        error: error.message 
      });
    }
  }

  async handleMotionDeletion(motionTaskId) {
    try {
      logger.info('Handling Motion task deletion', { motionTaskId });
      
      // Find the corresponding Notion page
      const notionTasks = await notionClient.queryDatabase({
        property: 'Motion Task ID',
        rich_text: {
          equals: motionTaskId
        }
      });
      
      if (notionTasks.length > 0) {
        const notionPageId = notionTasks[0].id;
        
        // Instead of deleting, update status to "Archived"
        await notionClient.updateTask(notionPageId, {
          status: 'Archived'
        });
        
        // Remove from cache since Motion task no longer exists
        await mappingCache.removeByMotionId(motionTaskId);
        
        logger.info('Motion task deleted - Notion task archived', { 
          motionTaskId, 
          notionPageId 
        });
      } else {
        logger.warn('Motion task deleted but no Notion page found', { motionTaskId });
      }
    } catch (error) {
      logger.error('Error handling Motion deletion', { motionTaskId, error: error.message });
    }
  }
}

module.exports = new SyncService();