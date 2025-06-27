const express = require('express');
const router = express.Router();
const axios = require('axios');
const { config } = require('../config');
const logger = require('../utils/logger');

// Create a debug Motion client that logs full HTTP details
class DebugMotionClient {
  constructor() {
    this.apiKey = config.motion.apiKey;
    this.workspaceId = config.motion.workspaceId;
    
    this.client = axios.create({
      baseURL: config.motion.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      }
    });
    
    // Log full request details
    this.client.interceptors.request.use((requestConfig) => {
      console.log('=== MOTION API REQUEST ===');
      console.log('URL:', requestConfig.method.toUpperCase(), requestConfig.baseURL + requestConfig.url);
      console.log('Headers:', JSON.stringify(requestConfig.headers, null, 2));
      console.log('Params:', JSON.stringify(requestConfig.params, null, 2));
      console.log('Body:', JSON.stringify(requestConfig.data, null, 2));
      console.log('========================');
      return requestConfig;
    });
    
    // Log full response
    this.client.interceptors.response.use(
      (response) => {
        console.log('=== MOTION API RESPONSE ===');
        console.log('Status:', response.status);
        console.log('Headers:', JSON.stringify(response.headers, null, 2));
        console.log('Data preview:', JSON.stringify(response.data).substring(0, 500) + '...');
        console.log('=========================');
        return response;
      },
      (error) => {
        console.log('=== MOTION API ERROR ===');
        console.log('Status:', error.response?.status);
        console.log('Error:', error.message);
        console.log('Response:', error.response?.data);
        console.log('=======================');
        throw error;
      }
    );
  }
  
  async testCreateTask() {
    const payload = {
      name: 'DEBUG TEST TASK - DELETE ME',
      workspaceId: this.workspaceId,
      duration: 30,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    
    console.log('Creating task with payload:', JSON.stringify(payload, null, 2));
    console.log('Configured workspace ID:', this.workspaceId);
    
    const response = await this.client.post('/tasks', payload);
    return response.data;
  }
  
  async testListTasks() {
    const params = {
      workspaceId: this.workspaceId
    };
    
    console.log('Listing tasks with params:', JSON.stringify(params, null, 2));
    console.log('Configured workspace ID:', this.workspaceId);
    
    const response = await this.client.get('/tasks', { params });
    return response.data;
  }
}

// Test create task with full HTTP trace
router.post('/test-create', async (req, res) => {
  try {
    const debugClient = new DebugMotionClient();
    const result = await debugClient.testCreateTask();
    
    res.json({
      success: true,
      configuredWorkspaceId: config.motion.workspaceId,
      createdTask: {
        id: result.id,
        name: result.name,
        workspace: result.workspace
      },
      message: 'Check Railway logs for full HTTP trace'
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      configuredWorkspaceId: config.motion.workspaceId
    });
  }
});

// Test list tasks with full HTTP trace
router.get('/test-list', async (req, res) => {
  try {
    const debugClient = new DebugMotionClient();
    const result = await debugClient.testListTasks();
    
    res.json({
      success: true,
      configuredWorkspaceId: config.motion.workspaceId,
      totalTasks: result.tasks?.length || 0,
      tasksPreview: result.tasks?.slice(0, 3).map(t => ({
        name: t.name,
        workspace: t.workspace?.name || 'Unknown'
      })),
      message: 'Check Railway logs for full HTTP trace'
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      configuredWorkspaceId: config.motion.workspaceId
    });
  }
});

// Show current configuration
router.get('/config', async (req, res) => {
  res.json({
    motion: {
      apiUrl: config.motion.apiUrl,
      workspaceId: config.motion.workspaceId,
      workspaceIdLength: config.motion.workspaceId?.length,
      apiKeyConfigured: !!config.motion.apiKey
    },
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      MOTION_WORKSPACE_ID: process.env.MOTION_WORKSPACE_ID,
      rawWorkspaceId: process.env.MOTION_WORKSPACE_ID
    }
  });
});

module.exports = router;