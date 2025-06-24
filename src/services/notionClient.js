const { Client } = require('@notionhq/client');
const { config } = require('../config');
const logger = require('../utils/logger');

class NotionClient {
  constructor() {
    this.client = new Client({
      auth: config.notion.apiKey
    });
    this.databaseId = config.notion.databaseId;
  }

  async getTask(pageId) {
    try {
      const response = await this.client.pages.retrieve({ page_id: pageId });
      return this.parseTask(response);
    } catch (error) {
      logger.error('Error fetching task from Notion', { pageId, error: error.message });
      throw error;
    }
  }

  async updateTask(pageId, taskData) {
    try {
      const properties = this.buildProperties(taskData);
      const response = await this.client.pages.update({
        page_id: pageId,
        properties
      });
      
      logger.info('Task updated in Notion', { pageId });
      return this.parseTask(response);
    } catch (error) {
      logger.error('Error updating task in Notion', { pageId, error: error.message });
      throw error;
    }
  }

  async createTask(taskData) {
    try {
      const properties = this.buildProperties(taskData);
      logger.info('Creating task in Notion with properties', {
        taskData,
        properties,
        databaseId: this.databaseId
      });
      
      const response = await this.client.pages.create({
        parent: { database_id: this.databaseId },
        properties
      });
      
      logger.info('Task created in Notion', { pageId: response.id });
      return this.parseTask(response);
    } catch (error) {
      logger.error('Error creating task in Notion', { 
        error: error.message,
        code: error.code,
        body: error.body,
        taskData,
        databaseId: this.databaseId
      });
      throw error;
    }
  }

  async queryDatabase(filter = {}) {
    try {
      const queryParams = {
        database_id: this.databaseId
      };
      
      // Only add filter if it's not empty
      if (Object.keys(filter).length > 0) {
        queryParams.filter = filter;
      }
      
      const response = await this.client.databases.query(queryParams);
      return response.results.map(page => this.parseTask(page));
    } catch (error) {
      logger.error('Error querying Notion database', { error: error.message });
      throw error;
    }
  }

  parseTask(page) {
    const properties = page.properties;
    return {
      id: page.id,
      name: properties.Name?.title?.[0]?.plain_text || '',
      description: properties.Tags?.rich_text?.[0]?.plain_text || '',
      status: properties.Status?.status?.name || 'Not started',
      priority: properties.Priority?.select?.name || 'Medium',
      dueDate: properties['Due date']?.date?.start || null,
      motionTaskId: properties['Motion Task ID']?.rich_text?.[0]?.plain_text || null,
      lastSynced: null,
      lastEdited: page.last_edited_time,
      url: page.url,
      hasAttachments: this.checkForAttachments(properties)
    };
  }

  checkForAttachments(properties) {
    // Check if any property contains file references
    for (const prop of Object.values(properties)) {
      if (prop.type === 'files' && prop.files && prop.files.length > 0) {
        return true;
      }
    }
    return false;
  }

  buildProperties(taskData) {
    const properties = {};
    
    if (taskData.name !== undefined) {
      properties.Name = {
        title: [{ text: { content: taskData.name } }]
      };
    }
    
    // Store description in Tags field since Description doesn't exist
    if (taskData.description !== undefined && taskData.description) {
      properties.Tags = {
        rich_text: [{ text: { content: taskData.description } }]
      };
    }
    
    if (taskData.status !== undefined) {
      properties.Status = {
        status: { name: taskData.status }
      };
    }
    
    if (taskData.priority !== undefined) {
      properties.Priority = {
        select: { name: taskData.priority }
      };
    }
    
    if (taskData.dueDate !== undefined) {
      // Only set due date if it's not null
      if (taskData.dueDate === null) {
        properties['Due date'] = {
          date: null
        };
      } else {
        properties['Due date'] = {
          date: { start: taskData.dueDate }
        };
      }
    }
    
    if (taskData.motionTaskId !== undefined) {
      properties['Motion Task ID'] = {
        rich_text: [{ text: { content: taskData.motionTaskId } }]
      };
    }
    
    // Only add Last Synced if it exists in the database
    // Otherwise Notion will throw an error
    // properties['Last Synced'] = {
    //   date: { start: new Date().toISOString() }
    // };
    
    return properties;
  }
}

module.exports = new NotionClient();