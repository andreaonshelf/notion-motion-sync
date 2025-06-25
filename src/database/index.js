const { Pool } = require('pg');
const logger = require('../utils/logger');

class DatabaseWrapper {
  constructor() {
    this.pool = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      // Use DATABASE_URL from environment (Railway provides this)
      // Fall back to individual connection params for local development
      const connectionString = process.env.DATABASE_URL;
      
      if (connectionString) {
        logger.info('Connecting to PostgreSQL using DATABASE_URL');
        this.pool = new Pool({
          connectionString,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
      } else {
        // Local development connection
        logger.info('Connecting to PostgreSQL using individual parameters');
        this.pool = new Pool({
          host: process.env.POSTGRES_HOST || 'localhost',
          port: process.env.POSTGRES_PORT || 5432,
          database: process.env.POSTGRES_DB || 'notion_motion_sync',
          user: process.env.POSTGRES_USER || 'postgres',
          password: process.env.POSTGRES_PASSWORD || 'postgres'
        });
      }

      // Test connection
      await this.pool.query('SELECT NOW()');
      logger.info('PostgreSQL connected successfully');

      // Create tables if they don't exist
      await this.createTables();
      
      // Create indexes for performance
      await this.createIndexes();
      
      // Run migrations
      await this.runMigrations();

      this.initialized = true;
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

  async createTables() {
    // Main sync tracking table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS sync_tasks (
        id SERIAL PRIMARY KEY,
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
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS sync_history (
        id SERIAL PRIMARY KEY,
        notion_page_id TEXT,
        motion_task_id TEXT,
        action TEXT,
        changes TEXT,
        error TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create update trigger for updated_at
    await this.pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await this.pool.query(`
      DROP TRIGGER IF EXISTS update_sync_tasks_timestamp ON sync_tasks;
    `);

    await this.pool.query(`
      CREATE TRIGGER update_sync_tasks_timestamp 
      BEFORE UPDATE ON sync_tasks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  async createIndexes() {
    // Index for finding tasks that need syncing
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_status 
      ON sync_tasks(sync_status, notion_last_edited, motion_last_synced);
    `);

    // Index for Motion ID lookups
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_motion_id 
      ON sync_tasks(motion_task_id);
    `);
  }

  async runMigrations() {
    try {
      logger.info('Running database migrations...');
      
      // Add schedule checkbox and other fields
      await this.pool.query(`
        ALTER TABLE sync_tasks 
        ADD COLUMN IF NOT EXISTS schedule_checkbox BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS duration INTEGER,
        ADD COLUMN IF NOT EXISTS due_date DATE,
        ADD COLUMN IF NOT EXISTS status TEXT;
      `);
      
      // Create index for schedule checkbox
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_schedule ON sync_tasks(schedule_checkbox);
      `);
      
      logger.info('Migrations completed successfully');
    } catch (error) {
      logger.error('Migration failed', { error: error.message });
      // Don't throw - migrations might have already run
    }
  }

  // Get or create a sync task record
  async upsertSyncTask(notionPageId, data = {}) {
    const query = `
      INSERT INTO sync_tasks (
        notion_page_id, 
        notion_name, 
        notion_last_edited,
        schedule_checkbox,
        duration,
        due_date,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT(notion_page_id) DO UPDATE SET
        notion_name = EXCLUDED.notion_name,
        notion_last_edited = EXCLUDED.notion_last_edited,
        schedule_checkbox = EXCLUDED.schedule_checkbox,
        duration = EXCLUDED.duration,
        due_date = EXCLUDED.due_date,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    
    const result = await this.pool.query(query, [
      notionPageId,
      data.name || null,
      data.lastEdited || null,
      data.schedule || false,
      data.duration || null,
      data.dueDate || null,
      data.status || null
    ]);
    
    return result.rows[0];
  }

  // Update Motion task ID after creation
  async setMotionTaskId(notionPageId, motionTaskId) {
    const query = `
      UPDATE sync_tasks 
      SET motion_task_id = $1, 
          sync_status = 'synced',
          motion_last_synced = CURRENT_TIMESTAMP,
          error_message = NULL,
          error_count = 0
      WHERE notion_page_id = $2;
    `;
    
    await this.pool.query(query, [motionTaskId, notionPageId]);
  }

  // Get tasks that need syncing
  async getTasksNeedingSync(limit = 10) {
    const query = `
      SELECT * FROM sync_tasks
      WHERE (
        -- New tasks without Motion ID
        (motion_task_id IS NULL AND sync_status = 'pending')
        -- Failed tasks ready for retry
        OR (sync_status = 'error' AND updated_at + INTERVAL '1 minute' * error_count * 5 < NOW())
        -- Tasks with changes
        OR (motion_task_id IS NOT NULL AND notion_last_edited > motion_last_synced)
        -- Stuck syncing tasks
        OR (sync_status = 'syncing' AND sync_lock_until < NOW())
        -- Periodic re-validation: check all tasks every 30 minutes
        OR (motion_task_id IS NOT NULL AND motion_last_synced < NOW() - INTERVAL '30 minutes')
      )
      ORDER BY 
        CASE 
          WHEN sync_status = 'error' THEN error_count
          ELSE 0
        END ASC,
        motion_last_synced ASC NULLS FIRST,
        notion_last_edited DESC
      LIMIT $1;
    `;
    
    const result = await this.pool.query(query, [limit]);
    return result.rows;
  }

  // Get only scheduled tasks that need syncing
  async getScheduledTasksNeedingSync(limit = 10) {
    const query = `
      SELECT * FROM sync_tasks
      WHERE schedule_checkbox = true
        AND (
          -- New scheduled tasks without Motion ID
          (motion_task_id IS NULL AND sync_status = 'pending')
          -- Failed tasks ready for retry
          OR (sync_status = 'error' AND updated_at + INTERVAL '1 minute' * error_count * 5 < NOW())
          -- Tasks with changes
          OR (motion_task_id IS NOT NULL AND notion_last_edited > motion_last_synced)
          -- Stuck syncing tasks
          OR (sync_status = 'syncing' AND sync_lock_until < NOW())
          -- Periodic re-validation: check all tasks every 30 minutes
          OR (motion_task_id IS NOT NULL AND motion_last_synced < NOW() - INTERVAL '30 minutes')
        )
      ORDER BY 
        CASE 
          WHEN sync_status = 'error' THEN error_count
          ELSE 0
        END ASC,
        motion_last_synced ASC NULLS FIRST,
        notion_last_edited DESC
      LIMIT $1;
    `;
    
    const result = await this.pool.query(query, [limit]);
    return result.rows;
  }

  // Lock a task for syncing
  async lockTaskForSync(id, lockMinutes = 2) {
    const query = `
      UPDATE sync_tasks 
      SET sync_status = 'syncing',
          sync_lock_until = NOW() + INTERVAL '${lockMinutes} minutes'
      WHERE id = $1 AND (
        sync_status != 'syncing' 
        OR sync_lock_until < NOW()
      )
      RETURNING *;
    `;
    
    const result = await this.pool.query(query, [id]);
    return result.rows.length > 0;
  }

  // Mark sync successful
  async markSyncSuccess(id, motionTaskId, duration, dueDate) {
    const query = `
      UPDATE sync_tasks 
      SET sync_status = 'synced',
          motion_task_id = $1,
          motion_last_synced = CURRENT_TIMESTAMP,
          last_duration = $2,
          last_due_date = $3,
          error_message = NULL,
          error_count = 0,
          sync_lock_until = NULL
      WHERE id = $4;
    `;
    
    await this.pool.query(query, [motionTaskId, duration, dueDate, id]);
  }

  // Mark sync failed
  async markSyncError(id, errorMessage) {
    const query = `
      UPDATE sync_tasks 
      SET sync_status = 'error',
          error_message = $1,
          error_count = error_count + 1,
          sync_lock_until = NULL
      WHERE id = $2;
    `;
    
    await this.pool.query(query, [errorMessage, id]);
  }

  // Log sync history
  async logSync(notionPageId, motionTaskId, action, changes = null, error = null) {
    const query = `
      INSERT INTO sync_history (notion_page_id, motion_task_id, action, changes, error)
      VALUES ($1, $2, $3, $4, $5);
    `;
    
    await this.pool.query(query, [
      notionPageId,
      motionTaskId,
      action,
      changes ? JSON.stringify(changes) : null,
      error
    ]);
  }

  // Get mapping by Notion ID
  async getMappingByNotionId(notionPageId) {
    const query = 'SELECT * FROM sync_tasks WHERE notion_page_id = $1';
    const result = await this.pool.query(query, [notionPageId]);
    return result.rows[0];
  }

  // Get mapping by Motion ID
  async getMappingByMotionId(motionTaskId) {
    const query = 'SELECT * FROM sync_tasks WHERE motion_task_id = $1';
    const result = await this.pool.query(query, [motionTaskId]);
    return result.rows[0];
  }

  // Remove mapping
  async removeMapping(notionPageId) {
    const query = 'DELETE FROM sync_tasks WHERE notion_page_id = $1';
    await this.pool.query(query, [notionPageId]);
  }

  // Get statistics
  async getStats() {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(motion_task_id) as synced,
        COUNT(CASE WHEN sync_status = 'error' THEN 1 END) as errors,
        COUNT(CASE WHEN sync_status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN sync_status = 'syncing' THEN 1 END) as syncing
      FROM sync_tasks;
    `;
    
    const result = await this.pool.query(query);
    return result.rows[0];
  }

  // Helper to check if database is available
  get db() {
    return this.initialized ? this.pool : null;
  }

  // Get all rows - for compatibility
  async all(sql, params = []) {
    const result = await this.pool.query(sql, params);
    return result.rows;
  }

  // Get single row
  async get(sql, params = []) {
    const result = await this.pool.query(sql, params);
    return result.rows[0];
  }

  // Run statement
  async run(sql, params = []) {
    const result = await this.pool.query(sql, params);
    return { changes: result.rowCount };
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      logger.info('Database connection closed');
    }
  }
}

module.exports = new DatabaseWrapper();