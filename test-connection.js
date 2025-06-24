require('dotenv').config();
const { config, validateConfig } = require('./src/config');
const notionClient = require('./src/services/notionClient');
const motionClient = require('./src/services/motionClient');
const logger = require('./src/utils/logger');

async function testConnections() {
  console.log('🔍 Testing API connections...\n');
  
  try {
    // Validate config first
    validateConfig();
    console.log('✅ Configuration validated\n');
  } catch (error) {
    console.error('❌ Configuration error:', error.message);
    process.exit(1);
  }
  
  // Test Notion connection
  console.log('📝 Testing Notion connection...');
  try {
    const tasks = await notionClient.queryDatabase();
    console.log(`✅ Notion connected! Found ${tasks.length} tasks in database\n`);
    if (tasks.length > 0) {
      console.log('   First task:', tasks[0].name || 'Untitled');
    }
  } catch (error) {
    console.error('❌ Notion connection failed:', error.message);
    console.error('   Make sure you shared the database with your integration!\n');
  }
  
  // Test Motion connection
  console.log('🚀 Testing Motion connection...');
  try {
    const response = await motionClient.listTasks();
    console.log('✅ Motion connected! API is accessible\n');
  } catch (error) {
    console.error('❌ Motion connection failed:', error.message);
    if (error.response?.status === 401) {
      console.error('   Check your Motion API key\n');
    } else if (error.response?.status === 400) {
      console.error('   API returned bad request - this might be normal if you have no tasks\n');
    } else {
      console.error('   Status:', error.response?.status);
      console.error('   Response:', error.response?.data);
    }
  }
  
  console.log('🎉 Connection test complete!');
}

testConnections().catch(console.error);