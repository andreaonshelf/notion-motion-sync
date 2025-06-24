const axios = require('axios');

const RAILWAY_URL = process.argv[2];
const SYNC_TYPE = process.argv[3] || 'motion-to-notion';

async function triggerSync() {
  if (!RAILWAY_URL) {
    console.log('Usage: node trigger-sync.js <RAILWAY_URL> [sync-type]');
    console.log('sync-type can be: motion-to-notion, full');
    console.log('Example: node trigger-sync.js https://your-app.railway.app motion-to-notion');
    return;
  }

  console.log(`Triggering ${SYNC_TYPE} sync at ${RAILWAY_URL}...`);

  try {
    const endpoint = SYNC_TYPE === 'full' ? '/sync/full' : '/sync/motion-to-notion';
    const response = await axios.post(`${RAILWAY_URL}${endpoint}`);
    
    console.log('✅ Sync triggered successfully!');
    console.log('Response:', response.data);
    
    // Check your Notion database to see if Motion tasks appeared!
    console.log('\n📋 Check your Notion database now to see if Motion tasks have been synced!');
    
  } catch (error) {
    console.error('❌ Error triggering sync:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

triggerSync();