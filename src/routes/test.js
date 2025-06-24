const express = require('express');
const axios = require('axios');
const { config } = require('../config');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/motion-direct', async (req, res) => {
  try {
    const apiKey = config.motion.apiKey;
    const url = `${config.motion.apiUrl}/tasks`;
    
    logger.info('Direct Motion API test', {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      apiKeyPreview: apiKey ? apiKey.substring(0, 10) + '...' : 'MISSING',
      url: url
    });
    
    const response = await axios.get(url, {
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    res.json({
      success: true,
      taskCount: response.data.tasks ? response.data.tasks.length : 0,
      data: response.data
    });
  } catch (error) {
    logger.error('Direct Motion API test failed', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    
    res.status(500).json({
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
});

module.exports = router;