const express = require('express');
const motionClient = require('../services/motionClient');
const logger = require('../utils/logger');

const router = express.Router();

// Test endpoint to see full Motion API response
router.get('/motion-full-response/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    logger.info('Fetching full Motion task details', { taskId });
    
    // Get the raw response to see all fields
    const response = await motionClient.client.get(`/tasks/${taskId}`);
    
    // Log the complete response
    logger.info('Full Motion API response', { 
      taskId,
      allFields: Object.keys(response.data),
      fullData: JSON.stringify(response.data, null, 2)
    });
    
    res.json({
      taskId,
      availableFields: Object.keys(response.data),
      fullResponse: response.data,
      schedulingFields: {
        scheduledDate: response.data.scheduledDate || 'NOT FOUND',
        scheduledTime: response.data.scheduledTime || 'NOT FOUND', 
        scheduledStart: response.data.scheduledStart || 'NOT FOUND',
        scheduledEnd: response.data.scheduledEnd || 'NOT FOUND',
        eta: response.data.eta || 'NOT FOUND',
        autoScheduled: response.data.autoScheduled || 'NOT FOUND',
        isScheduled: response.data.isScheduled || 'NOT FOUND'
      }
    });
  } catch (error) {
    logger.error('Error fetching Motion task', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Check if Motion has calendar or schedule endpoints
router.get('/motion-test-endpoints', async (req, res) => {
  const testEndpoints = [
    '/calendar',
    '/schedule', 
    '/tasks/scheduled',
    '/tasks/calendar',
    '/workspace/schedule'
  ];
  
  const results = {};
  
  for (const endpoint of testEndpoints) {
    try {
      logger.info(`Testing Motion endpoint: ${endpoint}`);
      const response = await motionClient.client.get(endpoint);
      results[endpoint] = {
        status: 'SUCCESS',
        responseKeys: Object.keys(response.data)
      };
    } catch (error) {
      results[endpoint] = {
        status: error.response?.status || 'ERROR',
        message: error.response?.data?.message || error.message
      };
    }
  }
  
  res.json(results);
});

module.exports = router;