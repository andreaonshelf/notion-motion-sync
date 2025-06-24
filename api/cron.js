const syncService = require('../src/services/syncService');
const pollService = require('../src/services/pollService');
const logger = require('../src/utils/logger');

// This endpoint will be called by Vercel Cron
module.exports = async (req, res) => {
  // Verify this is called by Vercel Cron (optional security)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    logger.info('Cron job triggered - polling Motion tasks');
    
    // Run the Motion polling
    await pollService.pollMotionChanges();
    
    res.status(200).json({ 
      success: true, 
      message: 'Motion polling completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Cron job error', { error: error.message });
    res.status(500).json({ 
      error: 'Polling failed', 
      details: error.message 
    });
  }
};