const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.db = null;
  }

  async initialize() {
    try {
      // Railway might need different path
      const dbPath = process.env.RAILWAY_VOLUME_MOUNT_PATH 
        ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'sync.db')
        : path.join(__dirname, '../../sync.db');
        
      logger.info('Attempting to open database', { dbPath });
      
      // Open database connection
      this.db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      logger.info('Database connected');

      // Create tables if they don't exist
      await this.createTables();
      
      // Create indexes for performance
      await this.createIndexes();

      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Database initialization failed', { 
        error: error.message,
        code: error.code,
        stack: error.stack 
      });
      throw error;
    }
  }

  async createTables() {
    // Main sync tracking table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notion_page_id TEXT UNIQUE NOT NULL,
        motion_task_id TEXT UNIQUE,
        notion_name TEXT,
        notion_last_edited TIMESTAMP,
        motion_last_synced TIMESTAMP,
        sync_status TEXT CHECK(sync_status IN ('pending', 'syncing', 'synced', 'error')) DEFAULT 'pending',
        sync_lock_until TIMESTAMP,
        error_message TEXT,
        error_count INTEGER DEFAULT 0,
        last_duration INTEGER,
        last_due_date TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Sync history for debugging
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notion_page_id TEXT,
        motion_task_id TEXT,
        action TEXT,
        changes JSON,
        error TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add trigger to update updated_at
    await this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_sync_tasks_timestamp 
      AFTER UPDATE ON sync_tasks
      BEGIN
        UPDATE sync_tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);
  }

  async createIndexes() {
    // Index for finding tasks that need syncing
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sync_status 
      ON sync_tasks(sync_status, notion_last_edited, motion_last_synced);
    `);

    // Index for Motion ID lookups
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_motion_id 
      ON sync_tasks(motion_task_id);
    `);
  }

  // Get or create a sync task record
  async upsertSyncTask(notionPageId, data = {}) {
    const sql = `
      INSERT INTO sync_tasks (notion_page_id, notion_name, notion_last_edited)
      VALUES (?, ?, ?)
      ON CONFLICT(notion_page_id) DO UPDATE SET
        notion_name = excluded.notion_name,
        notion_last_edited = excluded.notion_last_edited,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    
    const result = await this.db.get(sql, [
      notionPageId,
      data.name || null,
      data.lastEdited || null
    ]);
    
    return result;
  }

  // Update Motion task ID after creation
  async setMotionTaskId(notionPageId, motionTaskId) {
    const sql = `
      UPDATE sync_tasks 
      SET motion_task_id = ?, 
          sync_status = 'synced',
          motion_last_synced = CURRENT_TIMESTAMP,
          error_message = NULL,
          error_count = 0
      WHERE notion_page_id = ?;
    `;
    
    await this.db.run(sql, [motionTaskId, notionPageId]);
  }

  // Get tasks that need syncing
  async getTasksNeedingSync(limit = 10) {
    const sql = `
      SELECT * FROM sync_tasks
      WHERE (
        -- New tasks without Motion ID
        (motion_task_id IS NULL AND sync_status = 'pending')
        -- Failed tasks ready for retry
        OR (sync_status = 'error' AND datetime(updated_at, '+' || (error_count * 5) || ' minutes') < datetime('now'))
        -- Tasks with changes
        OR (motion_task_id IS NOT NULL AND notion_last_edited > motion_last_synced)
        -- Stuck syncing tasks
        OR (sync_status = 'syncing' AND sync_lock_until < datetime('now'))
      )
      ORDER BY 
        CASE 
          WHEN sync_status = 'error' THEN error_count
          ELSE 0
        END ASC,
        notion_last_edited DESC
      LIMIT ?;
    `;
    
    return await this.db.all(sql, [limit]);
  }

  // Lock a task for syncing
  async lockTaskForSync(id, lockMinutes = 2) {
    const sql = `
      UPDATE sync_tasks 
      SET sync_status = 'syncing',
          sync_lock_until = datetime('now', '+' || ? || ' minutes')
      WHERE id = ? AND (
        sync_status != 'syncing' 
        OR sync_lock_until < datetime('now')
      );
    `;
    
    const result = await this.db.run(sql, [lockMinutes, id]);
    return result.changes > 0;
  }

  // Mark sync successful
  async markSyncSuccess(id, motionTaskId, duration, dueDate) {
    const sql = `
      UPDATE sync_tasks 
      SET sync_status = 'synced',
          motion_task_id = ?,
          motion_last_synced = CURRENT_TIMESTAMP,
          last_duration = ?,
          last_due_date = ?,
          error_message = NULL,
          error_count = 0,
          sync_lock_until = NULL
      WHERE id = ?;
    `;
    
    await this.db.run(sql, [motionTaskId, duration, dueDate, id]);
  }

  // Mark sync failed
  async markSyncError(id, errorMessage) {
    const sql = `
      UPDATE sync_tasks 
      SET sync_status = 'error',
          error_message = ?,
          error_count = error_count + 1,
          sync_lock_until = NULL
      WHERE id = ?;
    `;
    
    await this.db.run(sql, [errorMessage, id]);
  }

  // Log sync history
  async logSync(notionPageId, motionTaskId, action, changes = null, error = null) {
    const sql = `
      INSERT INTO sync_history (notion_page_id, motion_task_id, action, changes, error)
      VALUES (?, ?, ?, ?, ?);
    `;
    
    await this.db.run(sql, [
      notionPageId,
      motionTaskId,
      action,
      changes ? JSON.stringify(changes) : null,
      error
    ]);
  }

  // Get mapping by Notion ID
  async getMappingByNotionId(notionPageId) {
    return await this.db.get(
      'SELECT * FROM sync_tasks WHERE notion_page_id = ?',
      [notionPageId]
    );
  }

  // Get mapping by Motion ID
  async getMappingByMotionId(motionTaskId) {
    return await this.db.get(
      'SELECT * FROM sync_tasks WHERE motion_task_id = ?',
      [motionTaskId]
    );
  }

  // Remove mapping
  async removeMapping(notionPageId) {
    await this.db.run(
      'DELETE FROM sync_tasks WHERE notion_page_id = ?',
      [notionPageId]
    );
  }

  // Get statistics
  async getStats() {
    const stats = await this.db.get(`
      SELECT 
        COUNT(*) as total,
        COUNT(motion_task_id) as synced,
        COUNT(CASE WHEN sync_status = 'error' THEN 1 END) as errors,
        COUNT(CASE WHEN sync_status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN sync_status = 'syncing' THEN 1 END) as syncing
      FROM sync_tasks;
    `);
    
    return stats;
  }

  async close() {
    if (this.db) {
      await this.db.close();
      logger.info('Database connection closed');
    }
  }
}

module.exports = new Database();