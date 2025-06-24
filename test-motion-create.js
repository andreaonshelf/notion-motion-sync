require('dotenv').config();
const motionClient = require('./src/services/motionClient');

async function testCreate() {
  try {
    console.log('Testing Motion create with minimal data...');
    
    // Try with just name
    const result = await motionClient.createTask({
      name: 'Test task from sync service'
    });
    
    console.log('Success! Task created:', result);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Status:', error.response?.status);
    console.error('Response:', error.response?.data);
  }
}

testCreate();