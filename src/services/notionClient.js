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
      
      // Log Motion fields being sent
      const motionFieldsInUpdate = {};
      if (properties['Motion Task ID']) motionFieldsInUpdate.motionTaskId = properties['Motion Task ID'];
      if (properties['Motion Start On']) motionFieldsInUpdate.motionStartOn = properties['Motion Start On'];
      if (properties['Motion Scheduled Start']) motionFieldsInUpdate.motionScheduledStart = properties['Motion Scheduled Start'];
      if (properties['Motion Scheduled End']) motionFieldsInUpdate.motionScheduledEnd = properties['Motion Scheduled End'];
      if (properties['Motion Status']) motionFieldsInUpdate.motionStatus = properties['Motion Status'];
      if (properties['Motion Scheduling Issue']) motionFieldsInUpdate.motionSchedulingIssue = properties['Motion Scheduling Issue'];
      if (properties['Motion Completed']) motionFieldsInUpdate.motionCompleted = properties['Motion Completed'];
      if (properties['Motion Deadline Type']) motionFieldsInUpdate.motionDeadlineType = properties['Motion Deadline Type'];
      
      logger.info('Updating task in Notion', { 
        pageId,
        taskDataReceived: taskData,
        motionFieldsInUpdate,
        allProperties: Object.keys(properties)
      });
      
      const response = await this.client.pages.update({
        page_id: pageId,
        properties
      });
      
      logger.info('Task updated in Notion successfully', { pageId });
      return this.parseTask(response);
    } catch (error) {
      logger.error('Error updating task in Notion', { 
        pageId, 
        error: error.message,
        errorBody: error.body,
        taskData 
      });
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

  async queryDatabase(filter = null) {
    try {
      const queryParams = {
        database_id: this.databaseId,
        page_size: 100
      };
      
      // Add filter if provided
      if (filter) {
        queryParams.filter = filter;
      }
      
      // Handle pagination
      let allResults = [];
      let hasMore = true;
      let startCursor = undefined;
      
      while (hasMore) {
        if (startCursor) {
          queryParams.start_cursor = startCursor;
        }
        
        const response = await this.client.databases.query(queryParams);
        allResults = allResults.concat(response.results);
        
        hasMore = response.has_more;
        startCursor = response.next_cursor;
      }
      
      logger.info(`Queried Notion database`, { 
        totalResults: allResults.length,
        hasFilter: !!filter 
      });
      
      return allResults.map(page => this.parseTask(page));
    } catch (error) {
      logger.error('Error querying Notion database', { error: error.message });
      throw error;
    }
  }

  parseTask(page) {
    const properties = page.properties;
    
    // Debug log for Raycast task
    if (properties.Name?.title?.[0]?.plain_text === 'Raycast') {
      logger.info('DEBUG: Raycast task properties', {
        allPropertyKeys: Object.keys(properties),
        durationProperty: properties['Duration (minutes)'],
        durationValue: properties['Duration (minutes)']?.number
      });
    }
    
    return {
      id: page.id,
      name: properties.Name?.title?.[0]?.plain_text || '',
      description: properties.Tags?.rich_text?.[0]?.plain_text || '',
      status: properties.Status?.status?.name || 'Not started',
      priority: properties.Priority?.select?.name || 'Medium',
      dueDate: properties['Due date']?.date?.start || null,
      duration: properties['Duration (minutes)']?.number || null,
      schedule: (() => {
        const scheduleValue = properties.Schedule?.checkbox;
        const taskName = properties.Name?.title?.[0]?.plain_text || 'Unknown';
        
        // Debug specific tasks that should be scheduled
        if (taskName.includes('Stress Test') || taskName.includes('Action Planning')) {
          logger.info(`Schedule checkbox debug for "${taskName}":`, {
            scheduleValue,
            scheduleProperty: properties.Schedule,
            hasScheduleProperty: 'Schedule' in properties,
            allProperties: Object.keys(properties)
          });
        }
        
        return scheduleValue || false;
      })(),
      startOn: properties['Start On']?.date?.start || null,
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
      // To clear the field in Notion, send empty array, not empty string
      if (taskData.motionTaskId === '' || taskData.motionTaskId === null) {
        properties['Motion Task ID'] = {
          rich_text: []
        };
      } else {
        properties['Motion Task ID'] = {
          rich_text: [{ text: { content: taskData.motionTaskId } }]
        };
      }
    }
    
    // Motion read-only fields
    if (taskData.motionStartOn !== undefined) {
      properties['Motion Start On'] = {
        date: taskData.motionStartOn ? { start: taskData.motionStartOn } : null
      };
    }
    
    if (taskData.motionScheduledStart !== undefined) {
      properties['Motion Scheduled Start'] = {
        date: taskData.motionScheduledStart ? { 
          start: new Date(taskData.motionScheduledStart).toISOString() 
        } : null
      };
    }
    
    if (taskData.motionScheduledEnd !== undefined) {
      properties['Motion Scheduled End'] = {
        date: taskData.motionScheduledEnd ? { 
          start: new Date(taskData.motionScheduledEnd).toISOString() 
        } : null
      };
    }
    
    if (taskData.motionStatus !== undefined) {
      properties['Motion Status'] = {
        rich_text: [{ text: { content: taskData.motionStatus || '' } }]
      };
    }
    
    if (taskData.motionSchedulingIssue !== undefined) {
      properties['Motion Scheduling Issue'] = {
        checkbox: taskData.motionSchedulingIssue || false
      };
    }
    
    if (taskData.motionCompleted !== undefined) {
      properties['Motion Completed'] = {
        checkbox: taskData.motionCompleted || false
      };
    }
    
    if (taskData.motionDeadlineType !== undefined) {
      properties['Motion Deadline Type'] = {
        select: taskData.motionDeadlineType ? { name: taskData.motionDeadlineType } : null
      };
    }
    
    if (taskData.duration !== undefined) {
      properties['Duration (minutes)'] = {
        number: taskData.duration
      };
    }
    
    if (taskData.schedule !== undefined) {
      properties.Schedule = {
        checkbox: taskData.schedule
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