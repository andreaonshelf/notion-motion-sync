const axios = require('axios');
const { config } = require('../config');
const logger = require('../utils/logger');

class MotionClient {
  constructor() {
    // Store API key as instance property
    this.apiKey = config.motion.apiKey;
    
    // Log API key details for debugging
    logger.info('Motion API key configured', { 
      keyLength: this.apiKey ? this.apiKey.length : 0,
      keyPreview: this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'missing'
    });
    
    this.client = axios.create({
      baseURL: config.motion.apiUrl,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // Add request/response interceptors for debugging
    this.client.interceptors.request.use((requestConfig) => {
      // Set API key from instance property
      requestConfig.headers['X-API-Key'] = this.apiKey;
      
      // Debug: Log exact headers being sent
      logger.info('Motion API request details', {
        method: requestConfig.method,
        url: requestConfig.url,
        baseURL: requestConfig.baseURL,
        fullURL: requestConfig.baseURL + requestConfig.url,
        headers: {
          'X-API-Key': requestConfig.headers['X-API-Key'] ? requestConfig.headers['X-API-Key'].substring(0, 10) + '...' : 'MISSING',
          'Content-Type': requestConfig.headers['Content-Type'],
          allKeys: Object.keys(requestConfig.headers)
        },
        apiKeyFromThis: this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'MISSING',
        apiKeyLength: this.apiKey ? this.apiKey.length : 0
      });
      
      return requestConfig;
    }, (error) => {
      logger.error('Motion request error', { error: error.message });
      return Promise.reject(error);
    });
    
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Motion API error response', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: JSON.stringify(error.response?.data),
          url: error.config?.url,
          method: error.config?.method,
          requestData: error.config?.data ? JSON.stringify(error.config.data).substring(0, 200) : undefined
        });
        return Promise.reject(error);
      }
    );
  }

  async createTask(taskData) {
    try {
      // Start with minimal required fields
      const payload = {
        name: taskData.name,
        workspaceId: config.motion.workspaceId
      };
      
      // Only add optional fields if they have values
      if (taskData.description) {
        payload.description = taskData.description;
      }
      
      if (taskData.dueDate) {
        payload.dueDate = taskData.dueDate;
      }
      
      // Only add status if it's not the default
      const mappedStatus = this.mapStatus(taskData.status);
      if (mappedStatus !== 'Todo') {
        payload.status = mappedStatus;
      }
      
      // Only add priority if specified
      if (taskData.priority) {
        payload.priority = this.mapPriority(taskData.priority);
      }
      
      // Only add duration if specified (in minutes)
      if (taskData.duration) {
        // Ensure duration is a number, not a string
        const durationValue = parseInt(taskData.duration);
        if (!isNaN(durationValue) && durationValue > 0) {
          payload.duration = durationValue;
        }
      }
      
      // Only add labels if they exist and are not empty
      if (taskData.labels && taskData.labels.length > 0) {
        payload.labels = taskData.labels;
      }
      
      logger.info('Creating Motion task with payload', { payload });
      
      const response = await this.client.post('/tasks', payload);
      
      // Check if we got a valid response with an ID
      if (!response.data || !response.data.id) {
        throw new Error('Motion API returned success but no task ID');
      }
      
      // Log the full response for tasks with duration + date
      if (payload.duration && payload.dueDate) {
        logger.info('Motion API response for duration+date task', {
          taskId: response.data.id,
          status: response.status,
          headers: response.headers,
          data: response.data,
          payload: payload
        });
      }
      
      logger.info('Task created in Motion', { taskId: response.data.id });
      return response.data;
    } catch (error) {
      logger.error('Error creating task in Motion', { 
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        payload: payload
      });
      throw error;
    }
  }

  async updateTask(taskId, taskData) {
    try {
      const updatePayload = {
        name: taskData.name,
        description: taskData.description,
        dueDate: taskData.dueDate,
        priority: this.mapPriority(taskData.priority),
        status: this.mapStatus(taskData.status),
        labels: taskData.labels || []
      };
      
      // Only add duration if specified (in minutes)
      if (taskData.duration) {
        // Ensure duration is a number, not a string
        const durationValue = parseInt(taskData.duration);
        if (!isNaN(durationValue) && durationValue > 0) {
          updatePayload.duration = durationValue;
        }
      }
      
      logger.info('Updating Motion task', { 
        taskId, 
        payload: updatePayload,
        hasDuration: 'duration' in updatePayload,
        durationValue: updatePayload.duration
      });
      
      const response = await this.client.patch(`/tasks/${taskId}`, updatePayload);
      
      logger.info('Task updated in Motion', { taskId });
      return response.data;
    } catch (error) {
      logger.error('Error updating task in Motion', { taskId, error: error.message });
      throw error;
    }
  }

  async getTask(taskId) {
    try {
      const response = await this.client.get(`/tasks/${taskId}`);
      return response.data;
    } catch (error) {
      logger.error('Error fetching task from Motion', { taskId, error: error.message });
      throw error;
    }
  }

  async listTasks(params = {}) {
    try {
      // Add workspace filter if configured
      if (config.motion.workspaceId) {
        params.workspaceId = config.motion.workspaceId;
      }
      
      logger.info('Fetching Motion tasks with params', { params, method: 'listTasks' });
      
      let allTasks = [];
      let cursor = null;
      let pageCount = 0;
      
      // Paginate through all results
      do {
        const pageParams = { ...params };
        if (cursor) {
          pageParams.cursor = cursor;
        }
        
        const response = await this.client.get('/tasks', { params: pageParams });
        
        if (response.data.tasks && response.data.tasks.length > 0) {
          allTasks = allTasks.concat(response.data.tasks);
          pageCount++;
          logger.info(`Fetched page ${pageCount}`, { 
            tasksInPage: response.data.tasks.length,
            totalSoFar: allTasks.length,
            hasCursor: !!response.data.cursor
          });
        }
        
        cursor = response.data.cursor || null;
        
        // Add small delay between pages to avoid rate limiting
        if (cursor) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } while (cursor);
      
      logger.info('All Motion tasks fetched', { 
        totalTasks: allTasks.length,
        pagesRetrieved: pageCount
      });
      
      return { tasks: allTasks };
    } catch (error) {
      logger.error('Error listing tasks from Motion', { 
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        fullURL: error.config?.baseURL + error.config?.url,
        params
      });
      throw error;
    }
  }

  mapPriority(notionPriority) {
    const priorityMap = {
      'High': 'HIGH',
      'Medium': 'MEDIUM',
      'Low': 'LOW'
    };
    return priorityMap[notionPriority] || 'MEDIUM';
  }

  mapStatus(notionStatus) {
    const statusMap = {
      'Not started': 'Todo',
      'In progress': 'In Progress',
      'Done': 'Completed',
      'Archived': 'Canceled'
    };
    return statusMap[notionStatus] || 'Todo';
  }

  async deleteTask(taskId) {
    try {
      const response = await this.client.delete(`/tasks/${taskId}`);
      logger.info('Task deleted in Motion', { taskId });
      return response.data;
    } catch (error) {
      logger.error('Error deleting task in Motion', { taskId, error: error.message });
      throw error;
    }
  }
}

module.exports = new MotionClient();