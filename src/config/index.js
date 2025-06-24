require('dotenv').config();

// Debug: Log all environment variables (safely)
console.log('All environment variable keys:', Object.keys(process.env).filter(key => 
  key.includes('MOTION') || key.includes('NOTION') || key === 'PORT'
));

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  motion: {
    apiKey: process.env.MOTION_API_KEY ? process.env.MOTION_API_KEY.trim() : undefined,
    apiUrl: (process.env.MOTION_API_URL || 'https://api.usemotion.com/v1').replace(/\/$/, ''), // Remove trailing slash
    workspaceId: process.env.MOTION_WORKSPACE_ID
  },
  
  notion: {
    apiKey: process.env.NOTION_API_KEY,
    databaseId: process.env.NOTION_DATABASE_ID
  },
  
  webhook: {
    secret: process.env.WEBHOOK_SECRET
  }
};

const validateConfig = () => {
  console.log('=== Configuration Validation ===');
  console.log('Environment variables loaded:', {
    NOTION_API_KEY: !!process.env.NOTION_API_KEY,
    NOTION_DATABASE_ID: !!process.env.NOTION_DATABASE_ID,
    MOTION_API_KEY: !!process.env.MOTION_API_KEY,
    MOTION_WORKSPACE_ID: !!process.env.MOTION_WORKSPACE_ID,
    PORT: process.env.PORT || 3000
  });
  
  const required = [
    'motion.apiKey',
    'motion.workspaceId',
    'notion.apiKey',
    'notion.databaseId'
  ];
  
  const missing = [];
  required.forEach(path => {
    const keys = path.split('.');
    let value = config;
    for (const key of keys) {
      value = value[key];
    }
    if (!value) {
      missing.push(path);
    }
  });
  
  if (missing.length > 0) {
    console.error('❌ Missing required configuration:', missing);
    console.error('Please set these environment variables in Railway');
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
  
  console.log('✅ Configuration validated successfully');
};

module.exports = { config, validateConfig };