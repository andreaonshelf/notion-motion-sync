const axios = require('axios');

// Replace with your actual Railway URL
const RAILWAY_URL = process.argv[2] || 'https://your-app.railway.app';

async function testDeployment() {
  console.log('Testing deployment at:', RAILWAY_URL);
  console.log('=====================================\n');

  try {
    // Test 1: Basic health check
    console.log('1. Testing basic health endpoint...');
    const healthResponse = await axios.get(`${RAILWAY_URL}/health`);
    console.log('✅ Health check passed:', healthResponse.data);
    console.log('\n');

    // Test 2: Root endpoint
    console.log('2. Testing root endpoint...');
    const rootResponse = await axios.get(RAILWAY_URL);
    console.log('✅ Root endpoint:', rootResponse.data);
    console.log('\n');

    // Test 3: Check if Motion sync is configured
    if (healthResponse.data.config?.motionConfigured) {
      console.log('✅ Motion API is configured');
    } else {
      console.log('❌ Motion API is NOT configured');
    }

    // Test 4: Check if Notion sync is configured
    if (healthResponse.data.config?.notionConfigured) {
      console.log('✅ Notion API is configured');
    } else {
      console.log('❌ Notion API is NOT configured');
    }

    console.log('\n=====================================');
    console.log('🎉 Deployment is working successfully!');
    console.log('\nNext steps:');
    console.log('1. Update your Notion webhook URL to:', `${RAILWAY_URL}/webhooks/notion`);
    console.log('2. Motion tasks will sync every minute automatically');
    console.log('3. You can manually trigger a full sync at:', `${RAILWAY_URL}/sync/full`);

  } catch (error) {
    console.error('❌ Error testing deployment:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

if (process.argv.length < 3) {
  console.log('Usage: node test-deployment.js <RAILWAY_URL>');
  console.log('Example: node test-deployment.js https://notion-motion-sync-production.up.railway.app');
} else {
  testDeployment();
}