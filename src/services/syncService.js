const motionClient = require('./motionClient');
const notionClient = require('./notionClient');
const mappingCache = require('./mappingCache');
const logger = require('../utils/logger');

class SyncService {
  constructor() {
    this.syncInProgress = new Set();
  }

  async syncNotionToMotion(notionPageId) {
    throw new Error('syncNotionToMotion() is DISABLED - use database-centric two-speed sync instead. All Motion operations must go through database queue.');
  }

  async syncMotionToNotion(motionTaskId) {
    throw new Error('syncMotionToNotion() is DISABLED - use database-centric two-speed sync instead. All sync operations must go through database.');
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
      logger.info('Starting full sync using two-speed approach');
      
      // Use the new two-speed sync architecture
      const pollService = require('./pollService');
      
      // Fast sync: Notion ↔ Database
      await pollService.fastSync();
      
      // Slow sync: Database ↔ Motion
      await pollService.slowSync();
      
      logger.info('Full sync completed using two-speed architecture');
    } catch (error) {
      logger.error('Error during full sync', { error: error.message });
      throw error;
    }
  }

  async syncAllMotionTasks() {
    try {
      logger.info('Starting Motion to Notion sync using two-speed approach');
      
      // Use the new two-speed sync architecture  
      const pollService = require('./pollService');
      
      // Fast sync: Notion ↔ Database
      await pollService.fastSync();
      
      // Slow sync: Database ↔ Motion
      await pollService.slowSync();
      
      logger.info('Motion to Notion sync completed using two-speed architecture');
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
    throw new Error('handleNotionDeletion() is DISABLED - use database-centric sync instead. Deletions should be handled by database queue.');
  }

  async handleMotionDeletion(motionTaskId) {
    throw new Error('handleMotionDeletion() is DISABLED - use database-centric sync instead. Deletions should be handled by database queue.');
  }
}

module.exports = new SyncService();