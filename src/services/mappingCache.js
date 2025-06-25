const logger = require('../utils/logger');
const database = require('../database');

class MappingCache {
  constructor() {
    // Keep in-memory cache for performance, but database is source of truth
    this.notionToMotion = new Map();
    this.motionToNotion = new Map();
  }

  async initialize(notionClient) {
    try {
      logger.info('Initializing mapping cache and database...');
      
      // Initialize database (PostgreSQL)
      await database.initialize();
      logger.info('Database initialized successfully');
      
      // Query only schedulable tasks from Notion (same filter as poll service)
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
      const tasks = await notionClient.queryDatabase(filter);
      
      let mappedCount = 0;
      let newCount = 0;
      
      for (const task of tasks) {
        // Upsert into database
        const syncTask = await database.upsertSyncTask(task.id, {
          name: task.name,
          lastEdited: task.lastEdited
        });
        
        if (task.motionTaskId) {
          // Update database with Motion ID if not already there
          if (!syncTask.motion_task_id) {
            await database.setMotionTaskId(task.id, task.motionTaskId);
            newCount++;
          }
          
          // Update in-memory cache
          this.setMapping(task.id, task.motionTaskId);
          mappedCount++;
        }
      }
      
      logger.info(`Database initialized with ${mappedCount} mappings (${newCount} new)`);
      
      // Load all mappings into memory for fast access
      const allMappings = await database.all(
        'SELECT notion_page_id, motion_task_id FROM sync_tasks WHERE motion_task_id IS NOT NULL'
      );
      
      for (const mapping of allMappings) {
        this.notionToMotion.set(mapping.notion_page_id, mapping.motion_task_id);
        this.motionToNotion.set(mapping.motion_task_id, mapping.notion_page_id);
      }
      
    } catch (error) {
      logger.error('Failed to initialize mapping cache', { error: error.message });
      throw error;
    }
  }

  async setMapping(notionPageId, motionTaskId) {
    if (!notionPageId || !motionTaskId) {
      logger.warn('Attempted to set mapping with missing ID', { notionPageId, motionTaskId });
      return;
    }
    
    // Update database
    await database.setMotionTaskId(notionPageId, motionTaskId);
    
    // Update in-memory cache
    this.notionToMotion.set(notionPageId, motionTaskId);
    this.motionToNotion.set(motionTaskId, notionPageId);
    
    logger.debug('Mapping set', { notionPageId, motionTaskId });
  }

  async getMotionId(notionPageId) {
    // Try memory first
    let motionId = this.notionToMotion.get(notionPageId);
    
    // Fall back to database
    if (!motionId) {
      const mapping = await database.getMappingByNotionId(notionPageId);
      if (mapping && mapping.motion_task_id) {
        motionId = mapping.motion_task_id;
        // Update cache
        this.notionToMotion.set(notionPageId, motionId);
        this.motionToNotion.set(motionId, notionPageId);
      }
    }
    
    return motionId;
  }

  async getNotionId(motionTaskId) {
    // Try memory first
    let notionId = this.motionToNotion.get(motionTaskId);
    
    // Fall back to database
    if (!notionId) {
      const mapping = await database.getMappingByMotionId(motionTaskId);
      if (mapping && mapping.notion_page_id) {
        notionId = mapping.notion_page_id;
        // Update cache
        this.notionToMotion.set(notionId, motionTaskId);
        this.motionToNotion.set(motionTaskId, notionId);
      }
    }
    
    return notionId;
  }

  async removeByNotionId(notionPageId) {
    // Remove from database
    await database.removeMapping(notionPageId);
    
    // Remove from memory
    const motionTaskId = this.notionToMotion.get(notionPageId);
    if (motionTaskId) {
      this.notionToMotion.delete(notionPageId);
      this.motionToNotion.delete(motionTaskId);
      logger.debug('Mapping removed by Notion ID', { notionPageId, motionTaskId });
    }
  }

  async removeByMotionId(motionTaskId) {
    const notionPageId = this.motionToNotion.get(motionTaskId);
    if (notionPageId) {
      // Remove from database
      await database.removeMapping(notionPageId);
      
      // Remove from memory
      this.notionToMotion.delete(notionPageId);
      this.motionToNotion.delete(motionTaskId);
      logger.debug('Mapping removed by Motion ID', { notionPageId, motionTaskId });
    }
  }

  async getStats() {
    const dbStats = await database.getStats();
    return {
      totalMappings: this.notionToMotion.size,
      database: dbStats,
      notionIds: Array.from(this.notionToMotion.keys()).slice(0, 5),
      motionIds: Array.from(this.motionToNotion.keys()).slice(0, 5)
    };
  }
}

module.exports = new MappingCache();