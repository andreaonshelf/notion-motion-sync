const { Pool } = require('pg');
const logger = require('../utils/logger');
const TransactionWrapper = require('./transactionWrapper');

class DatabaseWrapper {
  constructor() {
    this.pool = null;
    this.transaction = null;
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

      // Initialize transaction wrapper
      this.transaction = new TransactionWrapper(this.pool);
      
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
        ADD COLUMN IF NOT EXISTS status TEXT,
        ADD COLUMN IF NOT EXISTS priority TEXT;
      `);
      
      // Add new Motion sync fields
      await this.pool.query(`
        ALTER TABLE sync_tasks 
        ADD COLUMN IF NOT EXISTS start_on DATE,
        ADD COLUMN IF NOT EXISTS motion_start_on DATE,
        ADD COLUMN IF NOT EXISTS motion_scheduled_start TIMESTAMP,
        ADD COLUMN IF NOT EXISTS motion_scheduled_end TIMESTAMP,
        ADD COLUMN IF NOT EXISTS motion_scheduling_issue BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS motion_status_name TEXT,
        ADD COLUMN IF NOT EXISTS motion_status_resolved BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS motion_completed BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS motion_completed_time TIMESTAMP,
        ADD COLUMN IF NOT EXISTS motion_deadline_type TEXT,
        ADD COLUMN IF NOT EXISTS motion_updated_time TIMESTAMP;
      `);
      
      // Add multi-speed sync fields
      await this.pool.query(`
        ALTER TABLE sync_tasks 
        ADD COLUMN IF NOT EXISTS motion_sync_needed BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS motion_priority INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS motion_last_attempt TIMESTAMP,
        ADD COLUMN IF NOT EXISTS notion_sync_needed BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS needs_scheduling_refresh BOOLEAN DEFAULT FALSE;
      `);
      
      // Create indexes
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_schedule ON sync_tasks(schedule_checkbox);
        CREATE INDEX IF NOT EXISTS idx_motion_sync ON sync_tasks(motion_sync_needed, motion_priority);
        CREATE INDEX IF NOT EXISTS idx_notion_sync ON sync_tasks(notion_sync_needed);
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
        status,
        priority,
        start_on
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT(notion_page_id) DO UPDATE SET
        notion_name = EXCLUDED.notion_name,
        notion_last_edited = EXCLUDED.notion_last_edited,
        schedule_checkbox = EXCLUDED.schedule_checkbox,
        duration = EXCLUDED.duration,
        due_date = EXCLUDED.due_date,
        status = EXCLUDED.status,
        priority = EXCLUDED.priority,
        start_on = EXCLUDED.start_on,
        updated_at = CURRENT_TIMESTAMP
      WHERE sync_tasks.notion_last_edited IS DISTINCT FROM EXCLUDED.notion_last_edited
        OR sync_tasks.schedule_checkbox IS DISTINCT FROM EXCLUDED.schedule_checkbox
        OR sync_tasks.duration IS DISTINCT FROM EXCLUDED.duration
        OR sync_tasks.due_date IS DISTINCT FROM EXCLUDED.due_date
        OR sync_tasks.status IS DISTINCT FROM EXCLUDED.status
        OR sync_tasks.priority IS DISTINCT FROM EXCLUDED.priority
        OR sync_tasks.start_on IS DISTINCT FROM EXCLUDED.start_on
        OR sync_tasks.notion_name IS DISTINCT FROM EXCLUDED.notion_name
      RETURNING *;
    `;
    
    // Debug logging for schedule field issues
    if (data.name && (data.name.includes('Stress Test') || data.name.includes('Action Planning') || data.name.includes('Lets try once more'))) {
      logger.info(`Database upsert debug for "${data.name}":`, {
        inputSchedule: data.schedule,
        scheduleParameter: data.schedule || false,
        allInputData: data
      });
    }

    const result = await this.pool.query(query, [
      notionPageId,
      data.name || null,
      data.lastEdited || null,
      data.schedule || false,
      data.duration || null,
      data.dueDate || null,
      data.status || null,
      data.priority || null,
      data.startOn || null
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
          error_count = 0,
          notion_sync_needed = true
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

  // Multi-speed sync methods

  // Get tasks that need Motion operations (slow sync)
  async getMotionTasksToProcess(limit = 20) {
    const query = `
      SELECT * FROM sync_tasks 
      WHERE motion_sync_needed = true
        AND (
          motion_last_attempt IS NULL 
          OR motion_last_attempt < NOW() - INTERVAL '2 minutes'
        )
      ORDER BY 
        motion_priority ASC,
        motion_last_attempt ASC NULLS FIRST,
        updated_at ASC
      LIMIT $1
    `;
    const result = await this.pool.query(query, [limit]);
    
    // Log details about tasks being processed
    if (result.rows.length > 0) {
      logger.info(`Found ${result.rows.length} tasks needing Motion operations:`, {
        tasks: result.rows.map(t => ({
          name: t.notion_name,
          scheduled: t.schedule_checkbox,
          hasMotionId: !!t.motion_task_id,
          priority: t.motion_priority,
          lastAttempt: t.motion_last_attempt
        }))
      });
    }
    
    return result.rows;
  }

  // Get tasks that need Notion updates (fast sync)
  async getNotionTasksToUpdate(limit = 20) {
    const query = `
      SELECT * FROM sync_tasks 
      WHERE notion_sync_needed = true
      ORDER BY updated_at ASC
      LIMIT $1
    `;
    const result = await this.pool.query(query, [limit]);
    return result.rows;
  }

  // Mark task as needing Motion operation
  async markMotionSyncNeeded(notionPageId, priority = 2) {
    const query = `
      UPDATE sync_tasks 
      SET motion_sync_needed = true, 
          motion_priority = $1
      WHERE notion_page_id = $2
    `;
    await this.pool.query(query, [priority, notionPageId]);
  }

  // Mark task as needing Notion update
  async markNotionSyncNeeded(notionPageId) {
    const query = `
      UPDATE sync_tasks 
      SET notion_sync_needed = true
      WHERE notion_page_id = $1
    `;
    await this.pool.query(query, [notionPageId]);
  }

  // Complete Motion operation
  async completeMotionSync(notionPageId, motionTaskId = null) {
    try {
      const query = `
        UPDATE sync_tasks 
        SET motion_sync_needed = false,
            motion_last_attempt = CURRENT_TIMESTAMP,
            motion_task_id = $1,
            notion_sync_needed = true
        WHERE notion_page_id = $2
      `;
      const result = await this.pool.query(query, [motionTaskId, notionPageId]);
      
      if (result.rowCount === 0) {
        throw new Error(`No task found with notion_page_id: ${notionPageId}`);
      }
      
      logger.info('Motion sync completed', { 
        notionPageId, 
        motionTaskId,
        action: motionTaskId ? 'stored' : 'cleared'
      });
    } catch (error) {
      logger.error('CRITICAL: Failed to update Motion ID in database', {
        notionPageId,
        motionTaskId,
        error: error.message
      });
      throw error;
    }
  }
  
  // Update Motion fields from Motion API response
  // Calculate actual scheduling issues based on task data
  calculateSchedulingIssue(motionData) {
    const dueDate = motionData.dueDate ? new Date(motionData.dueDate) : null;
    const scheduledEnd = motionData.scheduledEnd ? new Date(motionData.scheduledEnd) : null;
    const now = new Date();
    
    // Task has scheduling issues if:
    // 1. It's past due and not completed/canceled
    // 2. It's scheduled to end after its due date
    // 3. It's overdue and still active
    const isPastDue = dueDate && dueDate < now;
    const isScheduledPastDue = dueDate && scheduledEnd && scheduledEnd > dueDate;
    const isActiveAndOverdue = isPastDue && motionData.status?.name && 
                               !['Completed', 'Canceled'].includes(motionData.status.name);
    
    const hasSchedulingIssue = isPastDue || isScheduledPastDue || isActiveAndOverdue;
    
    logger.info('Calculated scheduling issue', {
      taskName: motionData.name,
      dueDate: motionData.dueDate,
      scheduledEnd: motionData.scheduledEnd,
      status: motionData.status?.name,
      isPastDue,
      isScheduledPastDue,
      isActiveAndOverdue,
      hasSchedulingIssue,
      motionApiValue: motionData.schedulingIssue
    });
    
    return hasSchedulingIssue;
  }

  async updateMotionFields(notionPageId, motionData) {
    try {
      // Calculate actual scheduling issue instead of trusting Motion API
      const actualSchedulingIssue = this.calculateSchedulingIssue(motionData);
      
      const query = `
        UPDATE sync_tasks 
        SET motion_start_on = $1,
            motion_scheduled_start = $2,
            motion_scheduled_end = $3,
            motion_scheduling_issue = $4,
            motion_status_name = $5,
            motion_status_resolved = $6,
            motion_completed = $7,
            motion_completed_time = $8,
            motion_deadline_type = $9,
            motion_updated_time = $10,
            notion_sync_needed = true
        WHERE notion_page_id = $11
      `;
      
      const result = await this.pool.query(query, [
        motionData.startOn || null,
        motionData.scheduledStart || null,
        motionData.scheduledEnd || null,
        actualSchedulingIssue,
        motionData.status?.name || null,
        motionData.status?.isResolvedStatus || false,
        motionData.completed || false,
        motionData.completedTime || null,
        motionData.deadlineType || null,
        motionData.updatedTime || null,
        notionPageId
      ]);
      
      if (result.rowCount === 0) {
        throw new Error(`No task found with notion_page_id: ${notionPageId}`);
      }
      
      logger.info('Motion fields updated', {
        notionPageId,
        hasScheduling: !!motionData.scheduledStart
      });
    } catch (error) {
      logger.error('Failed to update Motion fields', {
        notionPageId,
        error: error.message
      });
      throw error;
    }
  }

  // Complete Notion update
  async completeNotionSync(notionPageId) {
    const query = `
      UPDATE sync_tasks 
      SET notion_sync_needed = false
      WHERE notion_page_id = $1
    `;
    await this.pool.query(query, [notionPageId]);
  }

  // Detect tasks that need Motion operations based on schedule/changes
  async detectMotionSyncNeeds() {
    // New scheduled tasks without Motion ID OR with invalid Motion ID
    await this.pool.query(`
      UPDATE sync_tasks 
      SET motion_sync_needed = true, 
          motion_priority = 1
      WHERE schedule_checkbox = true 
        AND motion_sync_needed = false
        AND (
          motion_task_id IS NULL 
          OR (
            motion_task_id IS NOT NULL 
            AND (
              motion_last_attempt IS NULL 
              OR motion_last_attempt < NOW() - INTERVAL '10 minutes'
            )
          )
        )
    `);

    // Unscheduled tasks with Motion ID
    await this.pool.query(`
      UPDATE sync_tasks 
      SET motion_sync_needed = true, motion_priority = 3
      WHERE schedule_checkbox = false 
        AND motion_task_id IS NOT NULL
        AND motion_sync_needed = false
    `);

    // Updated scheduled tasks
    await this.pool.query(`
      UPDATE sync_tasks 
      SET motion_sync_needed = true, motion_priority = 2
      WHERE schedule_checkbox = true 
        AND motion_task_id IS NOT NULL
        AND notion_last_edited > motion_last_synced
        AND motion_sync_needed = false
    `);
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      logger.info('Database connection closed');
    }
  }
}

module.exports = new DatabaseWrapper();