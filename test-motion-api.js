require('dotenv').config();
const axios = require('axios');

async function testMotionAPI() {
  const apiKey = process.env.MOTION_API_KEY.trim();
  const baseURL = 'https://api.usemotion.com/v1';
  
  console.log('Testing Motion API endpoints...\n');
  
  const endpoints = [
    '/tasks',
    '/task',
    '/projects',
    '/workspaces',
    '/users/me',
    '/'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(baseURL + endpoint, {
        headers: {
          'X-API-Key': apiKey,
          'Accept': 'application/json'
        }
      });
      console.log(`✅ ${endpoint} - Status: ${response.status}`);
    } catch (error) {
      console.log(`❌ ${endpoint} - Status: ${error.response?.status} ${error.response?.statusText || error.message}`);
    }
  }
}

testMotionAPI().catch(console.error);