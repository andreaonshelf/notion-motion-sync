const logger = require('../utils/logger');

class WebhookLog {
  constructor() {
    this.recentWebhooks = [];
    this.maxSize = 50;
  }

  logWebhook(type, data, result) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      data: {
        id: data.id,
        pageId: data.page?.id || data.data?.object?.id || data.id,
        eventType: data.type,
        workspace: data.workspace_name
      },
      result: result || 'pending'
    };
    
    this.recentWebhooks.unshift(entry);
    if (this.recentWebhooks.length > this.maxSize) {
      this.recentWebhooks = this.recentWebhooks.slice(0, this.maxSize);
    }
    
    logger.info('Webhook logged', entry);
  }

  getRecent(count = 10) {
    return this.recentWebhooks.slice(0, count);
  }

  clear() {
    this.recentWebhooks = [];
  }
}

module.exports = new WebhookLog();