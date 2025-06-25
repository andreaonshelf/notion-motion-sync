const logger = require('../utils/logger');

class ChangeTracker {
  constructor() {
    // Track last sync time for each task
    this.lastSyncTimes = new Map();
    // Track task checksums to detect changes
    this.taskChecksums = new Map();
  }

  generateChecksum(task) {
    // Create checksum of important fields
    return JSON.stringify({
      name: task.name,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      duration: task.duration,
      description: task.description?.substring(0, 100)
    });
  }

  hasChanged(notionPageId, task) {
    const currentChecksum = this.generateChecksum(task);
    const lastChecksum = this.taskChecksums.get(notionPageId);
    
    if (!lastChecksum || lastChecksum !== currentChecksum) {
      logger.info('Task has changed', {
        pageId: notionPageId,
        name: task.name,
        changed: !lastChecksum ? 'new' : 'modified'
      });
      return true;
    }
    
    return false;
  }

  markSynced(notionPageId, task) {
    this.lastSyncTimes.set(notionPageId, Date.now());
    this.taskChecksums.set(notionPageId, this.generateChecksum(task));
  }

  getLastSyncTime(notionPageId) {
    return this.lastSyncTimes.get(notionPageId) || 0;
  }

  getStats() {
    return {
      trackedTasks: this.taskChecksums.size,
      syncedTasks: this.lastSyncTimes.size
    };
  }
}

module.exports = new ChangeTracker();