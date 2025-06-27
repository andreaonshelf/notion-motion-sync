const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');

router.get('/diagnose', async (req, res) => {
  try {
    const apiKey = process.env.MOTION_API_KEY;
    const workspaceId = process.env.MOTION_WORKSPACE_ID;
    
    const results = {
      config: {
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey?.length,
        apiKeyPrefix: apiKey?.substring(0, 4),
        workspaceId: workspaceId,
        baseUrl: process.env.MOTION_API_URL || 'https://api.usemotion.com/v1'
      },
      tests: []
    };
    
    // Test 1: List tasks with workspace ID
    try {
      const response1 = await axios.get('https://api.usemotion.com/v1/tasks', {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json'
        },
        params: {
          workspaceId: workspaceId
        }
      });
      
      results.tests.push({
        test: 'List tasks WITH workspaceId param',
        success: true,
        taskCount: response1.data.tasks?.length || 0,
        tasks: response1.data.tasks?.slice(0, 2).map(t => ({ id: t.id, name: t.name, workspaceId: t.workspaceId }))
      });
    } catch (error) {
      results.tests.push({
        test: 'List tasks WITH workspaceId param',
        success: false,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
    }
    
    // Test 2: List tasks WITHOUT workspace ID param
    try {
      const response2 = await axios.get('https://api.usemotion.com/v1/tasks', {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      results.tests.push({
        test: 'List tasks WITHOUT workspaceId param',
        success: true,
        taskCount: response2.data.tasks?.length || 0,
        tasks: response2.data.tasks?.slice(0, 2).map(t => ({ id: t.id, name: t.name, workspaceId: t.workspaceId }))
      });
    } catch (error) {
      results.tests.push({
        test: 'List tasks WITHOUT workspaceId param',
        success: false,
        error: error.message,
        status: error.response?.status
      });
    }
    
    // Test 3: Get workspaces
    try {
      const response3 = await axios.get('https://api.usemotion.com/v1/workspaces', {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      results.tests.push({
        test: 'List workspaces',
        success: true,
        workspaceCount: response3.data.workspaces?.length || 0,
        workspaces: response3.data.workspaces?.map(w => ({ 
          id: w.id, 
          name: w.name,
          isConfigured: w.id === workspaceId 
        }))
      });
    } catch (error) {
      results.tests.push({
        test: 'List workspaces',
        success: false,
        error: error.message,
        status: error.response?.status
      });
    }
    
    // Test 4: Try specific task IDs from Notion
    const knownTaskIds = ['naU_fIzGBNYCE7PxjPlp_', 'FNWArMBF0_chhXEHbv5O-', 'DZaTJLD1mDTsrLuVa5XNi'];
    for (const taskId of knownTaskIds) {
      try {
        const response = await axios.get(`https://api.usemotion.com/v1/tasks/${taskId}`, {
          headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json'
          }
        });
        
        results.tests.push({
          test: `Get specific task: ${taskId}`,
          success: true,
          task: {
            id: response.data.id,
            name: response.data.name,
            workspaceId: response.data.workspaceId,
            status: response.data.status
          }
        });
      } catch (error) {
        results.tests.push({
          test: `Get specific task: ${taskId}`,
          success: false,
          error: error.message,
          status: error.response?.status
        });
      }
    }
    
    res.json(results);
    
  } catch (error) {
    logger.error('Motion API diagnostic failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;