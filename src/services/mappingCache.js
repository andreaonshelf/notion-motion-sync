const logger = require('../utils/logger');
const database = require('../database');

class MappingCache {
  constructor() {
    // Keep in-memory cache for performance, but database is source of truth
    this.notionToMotion = new Map();
    this.motionToNotion = new Map();
  }

  async initialize(notionClient) {
    let usingDatabase = false;
    
    try {
      logger.info('Initializing mapping cache and database...');
      
      // Try to initialize database
      try {
        database.initialize();
        usingDatabase = true;
        logger.info('Database initialized successfully');
      } catch (dbError) {
        logger.warn('Database initialization failed, using in-memory cache only', { 
          error: dbError.message 
        });
        // Continue without database
      }
      
      // Query all tasks from Notion
      const tasks = await notionClient.queryDatabase();
      
      let mappedCount = 0;
      let newCount = 0;
      
      for (const task of tasks) {
        if (usingDatabase) {
          // Try to use database
          try {
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
            }
          } catch (dbErr) {
            logger.debug('Database operation failed', { error: dbErr.message });
          }
        }
        
        if (task.motionTaskId) {
          // Always update in-memory cache
          this.notionToMotion.set(task.id, task.motionTaskId);
          this.motionToNotion.set(task.motionTaskId, task.id);
          mappedCount++;
        }
      }
      
      logger.info(`Mapping cache initialized with ${mappedCount} mappings`, {
        usingDatabase,
        newMappings: newCount
      });
      
      if (usingDatabase && database.db) {
        // Load all mappings into memory for fast access
        try {
          const allMappings = await database.db.all(
            'SELECT notion_page_id, motion_task_id FROM sync_tasks WHERE motion_task_id IS NOT NULL'
          );
          
          for (const mapping of allMappings) {
            this.notionToMotion.set(mapping.notion_page_id, mapping.motion_task_id);
            this.motionToNotion.set(mapping.motion_task_id, mapping.notion_page_id);
          }
        } catch (dbErr) {
          logger.debug('Failed to load mappings from database', { error: dbErr.message });
        }
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
    
    // Try to update database if available
    if (database.db) {
      try {
        await database.setMotionTaskId(notionPageId, motionTaskId);
      } catch (err) {
        logger.debug('Database update failed', { error: err.message });
      }
    }
    
    // Always update in-memory cache
    this.notionToMotion.set(notionPageId, motionTaskId);
    this.motionToNotion.set(motionTaskId, notionPageId);
    
    logger.debug('Mapping set', { notionPageId, motionTaskId });
  }

  async getMotionId(notionPageId) {
    // Try memory first
    let motionId = this.notionToMotion.get(notionPageId);
    
    // Fall back to database if available
    if (!motionId && database.db) {
      try {
        const mapping = await database.getMappingByNotionId(notionPageId);
        if (mapping && mapping.motion_task_id) {
          motionId = mapping.motion_task_id;
          // Update cache
          this.notionToMotion.set(notionPageId, motionId);
          this.motionToNotion.set(motionId, notionPageId);
        }
      } catch (err) {
        logger.debug('Database lookup failed', { error: err.message });
      }
    }
    
    return motionId;
  }

  async getNotionId(motionTaskId) {
    // Try memory first
    let notionId = this.motionToNotion.get(motionTaskId);
    
    // Fall back to database if available
    if (!notionId && database.db) {
      try {
        const mapping = await database.getMappingByMotionId(motionTaskId);
        if (mapping && mapping.notion_page_id) {
          notionId = mapping.notion_page_id;
          // Update cache
          this.notionToMotion.set(notionId, motionTaskId);
          this.motionToNotion.set(motionTaskId, notionId);
        }
      } catch (err) {
        logger.debug('Database lookup failed', { error: err.message });
      }
    }
    
    return notionId;
  }

  async removeByNotionId(notionPageId) {
    // Try to remove from database if available
    if (database.db) {
      try {
        await database.removeMapping(notionPageId);
      } catch (err) {
        logger.debug('Database removal failed', { error: err.message });
      }
    }
    
    // Always remove from memory
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
      // Try to remove from database if available
      if (database.db) {
        try {
          await database.removeMapping(notionPageId);
        } catch (err) {
          logger.debug('Database removal failed', { error: err.message });
        }
      }
      
      // Always remove from memory
      this.notionToMotion.delete(notionPageId);
      this.motionToNotion.delete(motionTaskId);
      logger.debug('Mapping removed by Motion ID', { notionPageId, motionTaskId });
    }
  }

  async getStats() {
    let dbStats = null;
    if (database.db) {
      try {
        dbStats = await database.getStats();
      } catch (err) {
        logger.debug('Database stats failed', { error: err.message });
      }
    }
    
    return {
      totalMappings: this.notionToMotion.size,
      database: dbStats,
      databaseAvailable: !!database.db,
      notionIds: Array.from(this.notionToMotion.keys()).slice(0, 5),
      motionIds: Array.from(this.motionToNotion.keys()).slice(0, 5)
    };
  }
}

module.exports = new MappingCache();