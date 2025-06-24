const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { config, validateConfig } = require('./config');
const logger = require('./utils/logger');
const errorHandler = require('./utils/errorHandler');
const webhookRoutes = require('./routes/webhooks');
const syncRoutes = require('./routes/sync');
const testRoutes = require('./routes/test');
const diagnosticRoutes = require('./routes/diagnostic');
const debugRoutes = require('./routes/debug');
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

app.get('/', (req, res) => {
  res.json({ 
    status: 'healthy', 
    message: 'Notion-Motion sync service is running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      webhooks: '/webhooks/notion',
      syncFull: '/sync/full',
      syncMotionToNotion: '/sync/motion-to-notion'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'notion-motion-sync',
    config: {
      notionConfigured: !!config.notion.apiKey,
      motionConfigured: !!config.motion.apiKey,
      pollingInterval: '1 minute'
    }
  });
});

app.get('/debug-motion-key', (req, res) => {
  const motionKey = process.env.MOTION_API_KEY;
  const notionKey = process.env.NOTION_API_KEY;
  
  res.json({
    motion: {
      hasKey: !!motionKey,
      keyLength: motionKey ? motionKey.length : 0,
      preview: motionKey ? motionKey.substring(0, 10) + '...' : 'missing',
      startsWithPK: motionKey ? motionKey.startsWith('PK') : false,
      firstChars: motionKey ? motionKey.substring(0, 3) : 'N/A'
    },
    notion: {
      hasKey: !!notionKey,
      keyLength: notionKey ? notionKey.length : 0,
      preview: notionKey ? notionKey.substring(0, 10) + '...' : 'missing',
      startsWithNtn: notionKey ? notionKey.startsWith('ntn_') : false,
      firstChars: notionKey ? notionKey.substring(0, 4) : 'N/A'
    },
    configValues: {
      motionFromConfig: config.motion.apiKey ? config.motion.apiKey.substring(0, 10) + '...' : 'missing',
      notionFromConfig: config.notion.apiKey ? config.notion.apiKey.substring(0, 10) + '...' : 'missing'
    }
  });
});

app.use('/webhooks', webhookRoutes);
app.use('/sync', syncRoutes);
app.use('/test', testRoutes);
app.use('/diagnostic', diagnosticRoutes);
app.use('/debug', debugRoutes);

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