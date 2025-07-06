require('dotenv').config();
const axios = require('axios');
const { config } = require('./src/config');

async function testMotionProjects() {
  try {
    console.log('Testing Motion API for project and alternative dependency mechanisms...');
    
    const client = axios.create({
      baseURL: config.motion.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.motion.apiKey
      }
    });
    
    // Test 1: Check projects endpoint
    console.log('\n=== Testing projects endpoint ===');
    try {
      const response = await client.get('/projects');
      console.log('✅ Projects endpoint exists');
      console.log(`Found ${response.data.projects?.length || 0} projects`);
      
      if (response.data.projects && response.data.projects.length > 0) {
        const sampleProject = response.data.projects[0];
        console.log('Sample project fields:', Object.keys(sampleProject));
        
        // Check if projects have dependency features
        const dependencyFields = Object.keys(sampleProject).filter(k => 
          k.toLowerCase().includes('depend') || 
          k.toLowerCase().includes('block') ||
          k.toLowerCase().includes('relation')
        );
        
        if (dependencyFields.length > 0) {
          console.log('Project dependency fields:', dependencyFields);
        }
      }
    } catch (error) {
      console.log('❌ Projects endpoint:', error.response?.status || error.message);
    }
    
    // Test 2: Check if tasks can reference other tasks via custom fields
    console.log('\n=== Testing task relationships via other fields ===');
    
    // Get a sample task and examine its structure more deeply
    try {
      const tasksResponse = await client.get('/tasks');
      if (tasksResponse.data.tasks && tasksResponse.data.tasks.length > 0) {
        const task = tasksResponse.data.tasks[0];
        
        console.log('\nDetailed task structure:');
        Object.keys(task).forEach(key => {
          console.log(`  ${key}: ${typeof task[key]} - ${JSON.stringify(task[key]).substring(0, 100)}`);
        });
        
        // Check labels - could be used for dependencies
        if (task.labels && task.labels.length > 0) {
          console.log('\nTask has labels - could be used for dependency tracking');
        }
        
        // Check custom fields
        if (task.customFieldValues) {
          console.log('\nTask has custom fields:', task.customFieldValues);
        }
      }
    } catch (error) {
      console.log('Error examining task structure:', error.message);
    }
    
    // Test 3: Check workspaces for dependency features
    console.log('\n=== Testing workspaces endpoint ===');
    try {
      const response = await client.get('/workspaces');
      console.log('✅ Workspaces endpoint exists');
      
      if (response.data.workspaces) {
        console.log(`Found ${response.data.workspaces.length} workspaces`);
        const workspace = response.data.workspaces.find(w => w.id === config.motion.workspaceId);
        if (workspace) {
          console.log('Current workspace fields:', Object.keys(workspace));
        }
      }
    } catch (error) {
      console.log('❌ Workspaces endpoint:', error.response?.status || error.message);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testMotionProjects();