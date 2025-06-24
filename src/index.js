const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { config, validateConfig } = require('./config');
const logger = require('./utils/logger');
const errorHandler = require('./utils/errorHandler');
const webhookRoutes = require('./routes/webhooks');
const syncRoutes = require('./routes/sync');
const pollService = require('./services/pollService');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    headers: req.headers
  });
  next();
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'notion-motion-sync'
  });
});

app.get('/debug-motion-key', (req, res) => {
  const apiKey = process.env.MOTION_API_KEY;
  
  res.json({
    hasKey: !!apiKey,
    keyLength: apiKey ? apiKey.length : 0,
    firstChar: apiKey ? apiKey.charCodeAt(0) : null,
    lastChar: apiKey ? apiKey.charCodeAt(apiKey.length - 1) : null,
    hasNewline: apiKey ? apiKey.includes('\n') : false,
    hasCarriageReturn: apiKey ? apiKey.includes('\r') : false,
    hasTab: apiKey ? apiKey.includes('\t') : false
  });
});

app.use('/webhooks', webhookRoutes);
app.use('/sync', syncRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

const start = async () => {
  try {
    validateConfig();
    
    const port = config.port;
    app.listen(port, () => {
      logger.info('Server started', { port });
      logger.info('Webhook endpoints:', {
        notion: `/webhooks/notion`,
        motion: `/webhooks/motion`
      });
      logger.info('Sync endpoints:', {
        fullSync: `/sync/full`,
        notionSync: `/sync/notion/:pageId`,
        motionSync: `/sync/motion/:taskId`
      });
      
      // Start polling for Motion changes only (since Motion doesn't have webhooks)
      pollService.start(1);
      logger.info('Polling service started for Motion (1 minute interval)');
      logger.info('Notion webhook service ready for real-time updates');
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

start();