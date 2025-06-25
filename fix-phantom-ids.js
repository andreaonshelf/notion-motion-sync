const database = require('./src/database');
const logger = require('./src/utils/logger');

async function fixPhantomIds() {
  try {
    await database.initialize();
    
    // Clear Motion IDs for tasks that we know are phantom
    const phantomTasks = [
      'Stress Test Assumptions',
      'Storyline for post: C6 acceptance'
    ];
    
    for (const taskName of phantomTasks) {
      const result = await database.pool.query(`
        UPDATE sync_tasks 
        SET motion_task_id = NULL,
            motion_sync_needed = true,
            motion_priority = 1,
            motion_last_attempt = NULL,
            sync_status = 'pending',
            notion_sync_needed = true
        WHERE notion_name = $1
        RETURNING *
      `, [taskName]);
      
      if (result.rows.length > 0) {
        logger.info(`Cleared phantom Motion ID for: ${taskName}`, {
          oldMotionId: result.rows[0].motion_task_id
        });
      }
    }
    
    logger.info('Phantom IDs cleared. Tasks will be recreated on next sync.');
    process.exit(0);
  } catch (error) {
    logger.error('Error fixing phantom IDs', { error: error.message });
    process.exit(1);
  }
}

fixPhantomIds();