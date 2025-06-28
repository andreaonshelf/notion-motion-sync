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
const manualSyncRoutes = require('./routes/diagnostic-manual-sync');
const pollService = require('./services/pollService');
const mappingCache = require('./services/mappingCache');
const notionClient = require('./services/notionClient');
const syncService = require('./services/syncService');

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
app.use('/manual', manualSyncRoutes);
app.use('/debug-scheduled', require('./routes/debug-scheduled-tasks'));
app.use('/motion-test', require('./routes/motion-api-test'));
app.use('/motion-fields', require('./routes/motion-fields-diagnostic'));
app.use('/test-flow', require('./routes/test-motion-fields-flow'));
app.use('/refresh-fields', require('./routes/refresh-motion-fields'));
app.use('/debug-motion', require('./routes/debug-motion-task'));
app.use('/restore-motion', require('./routes/restore-motion-ids'));
app.use('/debug-http', require('./routes/debug-http-trace'));
app.use('/notion-cleanup', require('./routes/notion-cleanup'));
app.use('/force-clear', require('./routes/force-clear-motion-ids'));
app.use('/check-motion', require('./routes/check-motion-tasks'));
app.use('/check-ai-forge', require('./routes/check-ai-forge-status'));
app.use('/motion-refresh', require('./routes/force-motion-refresh'));
app.use('/motion-diagnostic', require('./routes/motion-api-diagnostic'));
app.use('/motion-schedule', require('./routes/force-motion-autoschedule'));
app.use('/motion-force', require('./routes/motion-schedule-workround'));
app.use('/debug-motion-creation', require('./routes/debug-motion-creation'));
app.use('/force-retry', require('./routes/force-retry-motion'));

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

const start = async () => {
  try {
    validateConfig();
    
    // Initialize database and mapping cache BEFORE starting server
    logger.info('Initializing database and mapping cache...');
    await mappingCache.initialize(notionClient);
    logger.info('Database and mapping cache initialized successfully');
    
    const port = config.port;
    app.listen(port, () => {
      logger.info('Server started', { port, version: '1.2.0' });
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
      pollService.start(60, 3); // 60 seconds fast sync, 3 minutes slow sync
      logger.info('Polling service started: fast sync (60s), slow sync (3min)');
      logger.info('Notion updates via polling (webhooks disabled)');
      
      // On startup, sync any Notion tasks that don't have Motion IDs
      setTimeout(async () => {
        try {
          logger.info('Checking for unsynced Notion tasks on startup...');
          const tasks = await notionClient.queryDatabase();
          const unsyncedTasks = tasks.filter(task => !task.motionTaskId);
          
          if (unsyncedTasks.length > 0) {
            logger.info(`Found ${unsyncedTasks.length} unsynced Notion tasks, syncing...`);
            for (const task of unsyncedTasks) {
              try {
                await syncService.syncNotionToMotion(task.id);
                logger.info(`Synced unsynced task: ${task.name}`);
                // Delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 2000));
              } catch (error) {
                logger.error(`Failed to sync task ${task.name}`, { error: error.message });
              }
            }
          } else {
            logger.info('All Notion tasks already have Motion IDs');
          }
        } catch (error) {
          logger.error('Error checking for unsynced tasks on startup', { error: error.message });
        }
      }, 5000); // Wait 5 seconds after startup
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

start();