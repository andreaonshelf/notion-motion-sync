const Database = require('better-sqlite3');
const path = require('path');
const logger = require('../utils/logger');

class DatabaseWrapper {
  constructor() {
    this.db = null;
  }

  initialize() {
    try {
      // Use in-memory database for production to avoid file system issues
      const isProduction = process.env.NODE_ENV === 'production';
      const dbPath = isProduction ? ':memory:' : path.join(__dirname, '../../sync.db');
        
      logger.info('Opening database', { 
        dbPath,
        environment: process.env.NODE_ENV,
        isProduction 
      });
      
      // Try to load better-sqlite3
      try {
        const Database = require('better-sqlite3');
        logger.info('better-sqlite3 module loaded successfully');
      } catch (loadError) {
        logger.error('Failed to load better-sqlite3', {
          error: loadError.message,
          code: loadError.code
        });
        throw new Error(`Cannot load better-sqlite3: ${loadError.message}`);
      }
      
      // Open database connection
      this.db = new Database(dbPath);
      
      logger.info('Database connected');

      // Enable foreign keys
      this.db.exec('PRAGMA foreign_keys = ON');

      // Create tables if they don't exist
      this.createTables();
      
      // Create indexes for performance
      this.createIndexes();

      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Database initialization failed', { 
        error: error.message,
        code: error.code,
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }

  createTables() {
    // Main sync tracking table
    this.db.exec(`
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
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notion_page_id TEXT,
        motion_task_id TEXT,
        action TEXT,
        changes TEXT,
        error TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add trigger to update updated_at
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_sync_tasks_timestamp 
      AFTER UPDATE ON sync_tasks
      BEGIN
        UPDATE sync_tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);
  }

  createIndexes() {
    // Index for finding tasks that need syncing
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sync_status 
      ON sync_tasks(sync_status, notion_last_edited, motion_last_synced);
    `);

    // Index for Motion ID lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_motion_id 
      ON sync_tasks(motion_task_id);
    `);
  }

  // Get or create a sync task record
  upsertSyncTask(notionPageId, data = {}) {
    const stmt = this.db.prepare(`
      INSERT INTO sync_tasks (notion_page_id, notion_name, notion_last_edited)
      VALUES (?, ?, ?)
      ON CONFLICT(notion_page_id) DO UPDATE SET
        notion_name = excluded.notion_name,
        notion_last_edited = excluded.notion_last_edited,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `);
    
    return stmt.get(
      notionPageId,
      data.name || null,
      data.lastEdited || null
    );
  }

  // Update Motion task ID after creation
  setMotionTaskId(notionPageId, motionTaskId) {
    const stmt = this.db.prepare(`
      UPDATE sync_tasks 
      SET motion_task_id = ?, 
          sync_status = 'synced',
          motion_last_synced = CURRENT_TIMESTAMP,
          error_message = NULL,
          error_count = 0
      WHERE notion_page_id = ?;
    `);
    
    stmt.run(motionTaskId, notionPageId);
  }

  // Get tasks that need syncing
  getTasksNeedingSync(limit = 10) {
    const stmt = this.db.prepare(`
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
    `);
    
    return stmt.all(limit);
  }

  // Lock a task for syncing
  lockTaskForSync(id, lockMinutes = 2) {
    const stmt = this.db.prepare(`
      UPDATE sync_tasks 
      SET sync_status = 'syncing',
          sync_lock_until = datetime('now', '+' || ? || ' minutes')
      WHERE id = ? AND (
        sync_status != 'syncing' 
        OR sync_lock_until < datetime('now')
      );
    `);
    
    const result = stmt.run(lockMinutes, id);
    return result.changes > 0;
  }

  // Mark sync successful
  markSyncSuccess(id, motionTaskId, duration, dueDate) {
    const stmt = this.db.prepare(`
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
    `);
    
    stmt.run(motionTaskId, duration, dueDate, id);
  }

  // Mark sync failed
  markSyncError(id, errorMessage) {
    const stmt = this.db.prepare(`
      UPDATE sync_tasks 
      SET sync_status = 'error',
          error_message = ?,
          error_count = error_count + 1,
          sync_lock_until = NULL
      WHERE id = ?;
    `);
    
    stmt.run(errorMessage, id);
  }

  // Log sync history
  logSync(notionPageId, motionTaskId, action, changes = null, error = null) {
    const stmt = this.db.prepare(`
      INSERT INTO sync_history (notion_page_id, motion_task_id, action, changes, error)
      VALUES (?, ?, ?, ?, ?);
    `);
    
    stmt.run(
      notionPageId,
      motionTaskId,
      action,
      changes ? JSON.stringify(changes) : null,
      error
    );
  }

  // Get mapping by Notion ID
  getMappingByNotionId(notionPageId) {
    const stmt = this.db.prepare(
      'SELECT * FROM sync_tasks WHERE notion_page_id = ?'
    );
    return stmt.get(notionPageId);
  }

  // Get mapping by Motion ID
  getMappingByMotionId(motionTaskId) {
    const stmt = this.db.prepare(
      'SELECT * FROM sync_tasks WHERE motion_task_id = ?'
    );
    return stmt.get(motionTaskId);
  }

  // Remove mapping
  removeMapping(notionPageId) {
    const stmt = this.db.prepare(
      'DELETE FROM sync_tasks WHERE notion_page_id = ?'
    );
    stmt.run(notionPageId);
  }

  // Get statistics
  getStats() {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(motion_task_id) as synced,
        COUNT(CASE WHEN sync_status = 'error' THEN 1 END) as errors,
        COUNT(CASE WHEN sync_status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN sync_status = 'syncing' THEN 1 END) as syncing
      FROM sync_tasks;
    `);
    
    return stmt.get();
  }

  // Get all rows - for better-sqlite3 compatibility
  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  // Get single row
  get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params);
  }

  // Run statement
  run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  close() {
    if (this.db) {
      this.db.close();
      logger.info('Database connection closed');
    }
  }
}

module.exports = new DatabaseWrapper();