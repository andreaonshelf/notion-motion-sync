const motionClient = require('./motionClient');
const notionClient = require('./notionClient');
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
          dueDate: notionTask.dueDate
        });
        
        logger.info('Updated Motion task from Notion', { 
          notionPageId, 
          motionTaskId: motionTask.id 
        });
      } else {
        const enhancedDescription = this.enhanceDescriptionWithAttachments(notionTask);
        const motionTask = await motionClient.createTask({
          name: notionTask.name,
          description: enhancedDescription,
          status: notionTask.status,
          priority: notionTask.priority,
          dueDate: notionTask.dueDate
        });
        
        await notionClient.updateTask(notionPageId, {
          motionTaskId: motionTask.id
        });
        
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
        motionTaskId: motionTaskId
      };
      
      if (notionTasks.length > 0) {
        const notionPageId = notionTasks[0].id;
        await notionClient.updateTask(notionPageId, taskData);
        
        logger.info('Updated Notion task from Motion', { 
          motionTaskId, 
          notionPageId 
        });
      } else {
        const notionTask = await notionClient.createTask(taskData);
        
        logger.info('Created Notion task from Motion', { 
          motionTaskId, 
          notionPageId: notionTask.id 
        });
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

  async performFullSync() {
    try {
      logger.info('Starting full sync');
      
      const notionTasks = await notionClient.queryDatabase();
      let successCount = 0;
      let errorCount = 0;
      
      for (const task of notionTasks) {
        try {
          await this.syncNotionToMotion(task.id);
          successCount++;
        } catch (error) {
          logger.error('Failed to sync task', { 
            taskName: task.name, 
            error: error.message 
          });
          errorCount++;
        }
      }
      
      logger.info('Full sync completed', { 
        total: notionTasks.length,
        success: successCount,
        errors: errorCount
      });
    } catch (error) {
      logger.error('Error during full sync', { error: error.message });
      throw error;
    }
  }

  async syncAllMotionTasks() {
    try {
      logger.info('Starting Motion to Notion sync');
      
      const motionResponse = await motionClient.listTasks();
      const motionTasks = motionResponse.tasks || [];
      let successCount = 0;
      let errorCount = 0;
      
      for (const task of motionTasks) {
        try {
          await this.syncMotionToNotion(task.id);
          successCount++;
          // Add delay to avoid rate limits (Motion allows ~1 request per second)
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.error('Failed to sync Motion task', { 
            taskName: task.name, 
            error: error.message 
          });
          errorCount++;
          // If rate limited, wait much longer
          if (error.message.includes('429') || error.message.includes('Rate limit')) {
            logger.info('Rate limited, waiting 10 seconds...');
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
        }
      }
      
      logger.info('Motion to Notion sync completed', { 
        total: motionTasks.length,
        success: successCount,
        errors: errorCount
      });
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

  async handleNotionDeletion(notionPageId) {
    try {
      logger.info('Handling Notion page deletion', { notionPageId });
      
      // Get the Motion task ID from our tracking (if we have it)
      // Since the page is deleted, we can't query it anymore
      // In a production system, you'd want to maintain a mapping database
      
      // For now, we'll just log it
      logger.info('Notion page deleted - Motion task will remain', { notionPageId });
      
      // TODO: Implement mapping database to track Motion IDs for deleted Notion pages
    } catch (error) {
      logger.error('Error handling Notion deletion', { notionPageId, error: error.message });
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