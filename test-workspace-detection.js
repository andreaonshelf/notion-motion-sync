const axios = require('axios');
const { config } = require('./src/config');

async function testWorkspaceDetection() {
  try {
    console.log('Testing Motion API workspace detection...');
    
    const client = axios.create({
      baseURL: config.motion.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.motion.apiKey
      }
    });
    
    // Test 1: Fetch workspaces
    console.log('\n1. Fetching workspaces...');
    try {
      const workspacesResponse = await client.get('/workspaces');
      console.log('Workspaces response:', JSON.stringify(workspacesResponse.data, null, 2));
    } catch (error) {
      console.log('Workspaces error:', error.response?.status, error.response?.data);
    }
    
    // Test 2: Fetch existing tasks to see their workspace IDs
    console.log('\n2. Fetching existing tasks to see workspace IDs...');
    try {
      const tasksResponse = await client.get('/tasks');
      const tasks = tasksResponse.data.tasks || [];
      console.log(`Found ${tasks.length} existing tasks`);
      
      if (tasks.length > 0) {
        const workspaceIds = [...new Set(tasks.map(t => t.workspaceId).filter(Boolean))];
        console.log('Workspace IDs in use by existing tasks:', workspaceIds);
        
        // Show first task details
        console.log('\nFirst task details:');
        console.log('- Name:', tasks[0].name);
        console.log('- ID:', tasks[0].id);
        console.log('- Workspace ID:', tasks[0].workspaceId);
      }
    } catch (error) {
      console.log('Tasks error:', error.response?.status, error.response?.data);
    }
    
    // Test 3: Try creating a test task without workspace ID
    console.log('\n3. Testing task creation without workspace ID...');
    try {
      const createResponse = await client.post('/tasks', {
        name: 'Test Workspace Detection Task',
        description: 'Testing if Motion assigns default workspace'
      });
      console.log('Task created successfully without workspace ID!');
      console.log('New task workspace ID:', createResponse.data.workspaceId);
      console.log('New task ID:', createResponse.data.id);
      
      // Clean up - delete the test task
      await client.delete(`/tasks/${createResponse.data.id}`);
      console.log('Test task cleaned up');
    } catch (error) {
      console.log('Create without workspace error:', error.response?.status, error.response?.data);
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testWorkspaceDetection();