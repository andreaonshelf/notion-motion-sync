require('dotenv').config();
const axios = require('axios');

async function getWorkspace() {
  try {
    const response = await axios.get('https://api.usemotion.com/v1/workspaces', {
      headers: {
        'X-API-Key': process.env.MOTION_API_KEY.trim()
      }
    });
    
    console.log('Workspaces:', JSON.stringify(response.data, null, 2));
    
    if (response.data.workspaces && response.data.workspaces.length > 0) {
      console.log('\nFirst workspace ID:', response.data.workspaces[0].id);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

getWorkspace();