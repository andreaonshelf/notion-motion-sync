const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { config, validateConfig } = require('../src/config');
const logger = require('../src/utils/logger');
const errorHandler = require('../src/utils/errorHandler');
const webhookRoutes = require('../src/routes/webhooks');
const syncRoutes = require('../src/routes/sync');

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

// For Vercel, export the app as a function
module.exports = app;