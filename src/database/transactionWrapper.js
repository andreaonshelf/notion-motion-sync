const logger = require('../utils/logger');

class TransactionWrapper {
  constructor(pool) {
    this.pool = pool;
  }

  // Execute Motion operation with database transaction
  async executeWithTransaction(motionOperation, databaseOperations) {
    const client = await this.pool.connect();
    
    try {
      // Start transaction
      await client.query('BEGIN');
      
      // Get current state for potential rollback
      const backupStates = [];
      for (const op of databaseOperations) {
        if (op.notionPageId) {
          const backup = await client.query(
            'SELECT * FROM sync_tasks WHERE notion_page_id = $1',
            [op.notionPageId]
          );
          backupStates.push({
            notionPageId: op.notionPageId,
            data: backup.rows[0]
          });
        }
      }
      
      // Execute Motion operation
      let motionResult;
      try {
        motionResult = await motionOperation();
      } catch (motionError) {
        // Motion operation failed, rollback
        await client.query('ROLLBACK');
        throw motionError;
      }
      
      // Execute database operations
      try {
        for (const op of databaseOperations) {
          await client.query(op.query, op.params);
        }
        
        // Commit transaction
        await client.query('COMMIT');
        
        logger.info('Transaction completed successfully', {
          motionOperation: motionOperation.name,
          dbOperations: databaseOperations.length
        });
        
        return motionResult;
        
      } catch (dbError) {
        // Database operation failed after Motion succeeded - CRITICAL
        await client.query('ROLLBACK');
        
        logger.error('CRITICAL: Motion operation succeeded but database update failed', {
          motionResult,
          error: dbError.message,
          backupStates
        });
        
        // Attempt recovery based on operation type
        if (motionOperation.name === 'deleteTask') {
          // Motion task was deleted but DB update failed
          // We can't recreate the Motion task, but we should still clear the ID
          try {
            await this.forceUpdateMotionId(backupStates[0].notionPageId, null);
          } catch (recoveryError) {
            logger.error('Recovery failed', { recoveryError: recoveryError.message });
          }
        }
        
        throw new Error(`Database update failed after Motion operation: ${dbError.message}`);
      }
      
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Force update Motion ID outside of transaction for recovery
  async forceUpdateMotionId(notionPageId, motionId) {
    const query = `
      UPDATE sync_tasks 
      SET motion_task_id = $1,
          notion_sync_needed = true,
          updated_at = CURRENT_TIMESTAMP
      WHERE notion_page_id = $2
    `;
    
    await this.pool.query(query, [motionId, notionPageId]);
    
    logger.info('Forced Motion ID update for recovery', {
      notionPageId,
      motionId
    });
  }
}

module.exports = TransactionWrapper;