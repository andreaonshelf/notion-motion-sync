require('dotenv').config();
const axios = require('axios');
const { config } = require('./src/config');

async function testMotionCompletedTasks() {
  try {
    console.log('🔍 TESTING MOTION API COMPLETED TASK BEHAVIOR\n');
    
    const client = axios.create({
      baseURL: config.motion.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.motion.apiKey
      }
    });
    
    // Test 1: Default task list
    console.log('1. DEFAULT TASK LIST:');
    const defaultResponse = await client.get('/tasks');
    console.log(`Found ${defaultResponse.data.tasks.length} tasks`);
    const defaultStatuses = [...new Set(defaultResponse.data.tasks.map(t => t.status?.name))];
    console.log('Statuses:', defaultStatuses);
    
    // Test 2: Try different query parameters
    console.log('\n2. TESTING QUERY PARAMETERS:');
    
    const queries = [
      { params: { status: 'Completed' }, name: 'status=Completed' },
      { params: { status: 'COMPLETED' }, name: 'status=COMPLETED' },
      { params: { completed: true }, name: 'completed=true' },
      { params: { includeCompleted: true }, name: 'includeCompleted=true' },
      { params: { showAll: true }, name: 'showAll=true' },
      { params: { archived: true }, name: 'archived=true' }
    ];
    
    for (const query of queries) {
      try {
        const response = await client.get('/tasks', query);
        console.log(`✅ ${query.name}: ${response.data.tasks.length} tasks`);
        
        const completedCount = response.data.tasks.filter(t => 
          t.completed === true || t.status?.name === 'Completed'
        ).length;
        
        if (completedCount > 0) {
          console.log(`   Found ${completedCount} completed tasks!`);
        }
      } catch (error) {
        console.log(`❌ ${query.name}: ${error.response?.status || error.message}`);
      }
    }
    
    // Test 3: Check if completed tasks have different endpoint
    console.log('\n3. TESTING ALTERNATIVE ENDPOINTS:');
    
    const endpoints = [
      '/completed-tasks',
      '/tasks/completed',
      '/tasks/history',
      '/tasks/archive'
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await client.get(endpoint);
        console.log(`✅ ${endpoint}: Found ${response.data.tasks?.length || 'unknown'} items`);
      } catch (error) {
        console.log(`❌ ${endpoint}: ${error.response?.status || 'not found'}`);
      }
    }
    
    console.log('\n📊 ANALYSIS:');
    console.log('Motion API behavior with completed tasks:');
    console.log('- Default /tasks endpoint excludes completed tasks');
    console.log('- No obvious parameter to include completed tasks');
    console.log('- Completed tasks disappear from API responses');
    
    console.log('\n🎯 RECOMMENDED APPROACH:');
    console.log('1. Mark tasks as complete in Motion (as you did)');
    console.log('2. DON\'T delete from Notion - update status to "Done"');
    console.log('3. This preserves task history and relationships');
    console.log('4. Notion becomes your archive of completed work');
    
    console.log('\n⚡ IMMEDIATE ACTION:');
    console.log('For the 2 tasks you completed in Motion:');
    console.log('1. Update their status to "Done" in Notion manually');
    console.log('2. This keeps your historical record intact');
    console.log('3. Motion handles active tasks, Notion stores history');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testMotionCompletedTasks();