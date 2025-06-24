const logger = require('../utils/logger');

class MappingCache {
  constructor() {
    // In-memory cache mapping Notion page IDs to Motion task IDs
    this.notionToMotion = new Map();
    // Reverse mapping for quick lookups
    this.motionToNotion = new Map();
  }

  // Add or update a mapping
  setMapping(notionPageId, motionTaskId) {
    if (!notionPageId || !motionTaskId) {
      logger.warn('Attempted to set mapping with missing ID', { notionPageId, motionTaskId });
      return;
    }

    // Remove any existing mappings for these IDs
    const oldMotionId = this.notionToMotion.get(notionPageId);
    const oldNotionId = this.motionToNotion.get(motionTaskId);
    
    if (oldMotionId && oldMotionId !== motionTaskId) {
      this.motionToNotion.delete(oldMotionId);
    }
    
    if (oldNotionId && oldNotionId !== notionPageId) {
      this.notionToMotion.delete(oldNotionId);
    }

    // Set new mappings
    this.notionToMotion.set(notionPageId, motionTaskId);
    this.motionToNotion.set(motionTaskId, notionPageId);
    
    logger.info('Mapping cached', { 
      notionPageId, 
      motionTaskId,
      totalMappings: this.notionToMotion.size 
    });
  }

  // Get Motion task ID from Notion page ID
  getMotionId(notionPageId) {
    return this.notionToMotion.get(notionPageId) || null;
  }

  // Get Notion page ID from Motion task ID
  getNotionId(motionTaskId) {
    return this.motionToNotion.get(motionTaskId) || null;
  }

  // Remove a mapping by Notion page ID
  removeByNotionId(notionPageId) {
    const motionTaskId = this.notionToMotion.get(notionPageId);
    if (motionTaskId) {
      this.notionToMotion.delete(notionPageId);
      this.motionToNotion.delete(motionTaskId);
      logger.info('Mapping removed', { notionPageId, motionTaskId });
    }
  }

  // Remove a mapping by Motion task ID
  removeByMotionId(motionTaskId) {
    const notionPageId = this.motionToNotion.get(motionTaskId);
    if (notionPageId) {
      this.motionToNotion.delete(motionTaskId);
      this.notionToMotion.delete(notionPageId);
      logger.info('Mapping removed', { notionPageId, motionTaskId });
    }
  }

  // Get cache statistics
  getStats() {
    return {
      totalMappings: this.notionToMotion.size,
      notionIds: Array.from(this.notionToMotion.keys()),
      motionIds: Array.from(this.motionToNotion.keys())
    };
  }

  // Initialize cache from existing data
  async initialize(notionClient) {
    try {
      logger.info('Initializing mapping cache...');
      const notionTasks = await notionClient.queryDatabase();
      
      let count = 0;
      for (const task of notionTasks) {
        if (task.id && task.motionTaskId) {
          this.setMapping(task.id, task.motionTaskId);
          count++;
        }
      }
      
      logger.info('Mapping cache initialized', { 
        totalMappings: count,
        totalNotionTasks: notionTasks.length 
      });
    } catch (error) {
      logger.error('Failed to initialize mapping cache', { error: error.message });
    }
  }
}

module.exports = new MappingCache();