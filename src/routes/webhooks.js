const express = require('express');
const crypto = require('crypto');
const { config } = require('../config');
const syncService = require('../services/syncService');
const webhookLog = require('../services/webhookLog');
const logger = require('../utils/logger');

const router = express.Router();

const verifyWebhookSignature = (req, res, next) => {
  if (!config.webhook.secret) {
    return next();
  }

  const signature = req.headers['x-webhook-signature'];
  if (!signature) {
    return res.status(401).json({ error: 'Missing webhook signature' });
  }

  const expectedSignature = crypto
    .createHmac('sha256', config.webhook.secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
};

router.post('/notion', async (req, res) => {
  try {
    // Handle Notion webhook verification
    if (req.body.verification_token) {
      const token = req.body.verification_token;
      logger.info('Notion webhook verification request received', { 
        verification_token: token,
        token_preview: token.substring(0, 10) + '...'
      });
      logger.warn(`VERIFICATION TOKEN: ${token}`);
      res.json({ verification_token: token });
      return;
    }
    
    // Verify webhook signature for actual events
    if (config.webhook.secret && req.headers['x-webhook-signature']) {
      const signature = req.headers['x-webhook-signature'];
      const expectedSignature = crypto
        .createHmac('sha256', config.webhook.secret)
        .update(JSON.stringify(req.body))
        .digest('hex');
      
      if (signature !== expectedSignature) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    }
    
    // Notion webhook structure is different than expected
    const event = req.body;
    logger.info('Received Notion webhook', { 
      type: event.type,
      pageId: event.page?.id || event.data?.object?.id,
      fullEvent: JSON.stringify(event).substring(0, 200)
    });
    
    // Log webhook for tracking
    webhookLog.logWebhook('notion', event);
    
    // Extract page ID from various possible locations
    const pageId = event.page?.id || event.data?.object?.id || event.id;
    
    if (!pageId) {
      logger.warn('No page ID found in webhook', { body: req.body });
      return res.json({ success: false, message: 'No page ID found' });
    }
    
    // Handle different Notion event types
    if (event.type === 'page.content_updated' || event.type === 'page.property_values_updated') {
      await syncService.syncNotionToMotion(pageId);
      webhookLog.logWebhook('notion', event, 'synced');
      res.json({ success: true, message: 'Sync initiated' });
    } else if (event.type === 'page.created') {
      // Add a small delay for page.created to ensure Notion has fully saved the page
      setTimeout(async () => {
        try {
          await syncService.syncNotionToMotion(pageId);
          webhookLog.logWebhook('notion', event, 'synced');
          logger.info('New page synced after delay', { pageId });
        } catch (error) {
          logger.error('Failed to sync new page after delay', { pageId, error: error.message });
          webhookLog.logWebhook('notion', event, 'failed: ' + error.message);
        }
      }, 2000); // 2 second delay
      res.json({ success: true, message: 'New page sync scheduled' });
    } else if (event.type === 'page.deleted') {
      // Try to extract Motion task ID from the event data
      // Note: This might not be available if Notion doesn't send page properties on deletion
      const motionTaskId = event.page?.properties?.['Motion Task ID']?.rich_text?.[0]?.plain_text || 
                          event.data?.properties?.['Motion Task ID']?.rich_text?.[0]?.plain_text ||
                          null;
      
      logger.info('Page deletion event details', {
        pageId,
        motionTaskId,
        eventProperties: event.page?.properties ? Object.keys(event.page.properties) : 'No properties',
        fullEvent: JSON.stringify(event)
      });
      
      await syncService.handleNotionDeletion(pageId, motionTaskId);
      res.json({ success: true, message: 'Deletion handled' });
    } else {
      res.json({ success: true, message: 'Webhook received but no action taken' });
    }
  } catch (error) {
    logger.error('Error processing Notion webhook', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/motion', verifyWebhookSignature, async (req, res) => {
  try {
    const { type, data } = req.body;
    
    logger.info('Received Motion webhook', { type, taskId: data?.id });
    
    if (type === 'task.updated' || type === 'task.created') {
      await syncService.syncMotionToNotion(data.id);
      res.json({ success: true, message: 'Sync initiated' });
    } else {
      res.json({ success: true, message: 'Webhook received but no action taken' });
    }
  } catch (error) {
    logger.error('Error processing Motion webhook', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;