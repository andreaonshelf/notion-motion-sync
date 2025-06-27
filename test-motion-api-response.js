require('dotenv').config();
const axios = require('axios');

const MOTION_API_KEY = process.env.MOTION_API_KEY;
const MOTION_API_URL = 'https://api.usemotion.com/v1';

async function testMotionFullResponse(taskId) {
  try {
    console.log(`\nFetching full Motion API response for task: ${taskId}\n`);
    
    const response = await axios.get(`${MOTION_API_URL}/tasks/${taskId}`, {
      headers: {
        'X-API-Key': MOTION_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    const data = response.data;
    
    console.log('=== FULL MOTION API RESPONSE ===');
    console.log(JSON.stringify(data, null, 2));
    
    console.log('\n=== AVAILABLE FIELDS ===');
    console.log('All fields:', Object.keys(data));
    
    console.log('\n=== SCHEDULING RELATED FIELDS ===');
    const schedulingFields = [
      'scheduledDate', 'scheduledTime', 'scheduledStart', 'scheduledEnd',
      'eta', 'autoScheduled', 'isScheduled', 'schedule', 'scheduling',
      'dueDate', 'duration', 'startDate', 'endDate', 'plannedStart',
      'plannedEnd', 'actualStart', 'actualEnd'
    ];
    
    schedulingFields.forEach(field => {
      if (data[field] !== undefined) {
        console.log(`${field}: ${JSON.stringify(data[field])}`);
      }
    });
    
    console.log('\n=== FIELDS NOT CURRENTLY MAPPED ===');
    const currentlyMappedFields = ['id', 'name', 'description', 'status', 'priority', 'dueDate', 'duration', 'workspaceId', 'projectId', 'assigneeId'];
    const unmappedFields = Object.keys(data).filter(field => !currentlyMappedFields.includes(field));
    
    unmappedFields.forEach(field => {
      console.log(`${field}: ${JSON.stringify(data[field])}`);
    });
    
  } catch (error) {
    console.error('Error fetching Motion task:', error.response?.data || error.message);
  }
}

// Use the task ID we found
const taskId = process.argv[2] || 'vxBza-nYqVAFiyvOHeADY';
testMotionFullResponse(taskId);