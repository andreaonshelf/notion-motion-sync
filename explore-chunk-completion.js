require('dotenv').config();
const motionClient = require('./src/services/motionClient');

async function exploreChunkCompletion() {
  try {
    console.log('=== Exploring Motion Chunk Completion Options ===\n');
    
    // First, let's examine Motion's chunk structure
    console.log('1. EXAMINING MOTION CHUNK DATA');
    console.log('Getting sample Motion task to see chunk structure...\n');
    
    const result = await motionClient.listTasks();
    if (result.tasks.length > 0) {
      const sampleTask = result.tasks[0];
      
      console.log(`Sample task: ${sampleTask.name}`);
      console.log(`Duration: ${sampleTask.duration} minutes`);
      console.log(`Chunks:`, sampleTask.chunks);
      
      if (sampleTask.chunks && sampleTask.chunks.length > 0) {
        console.log('\nChunk structure:');
        sampleTask.chunks.forEach((chunk, i) => {
          console.log(`Chunk ${i + 1}:`, JSON.stringify(chunk, null, 2));
        });
      } else {
        console.log('No chunks found in this task.');
      }
      
      // Check if Motion has chunk-related endpoints
      console.log('\n2. TESTING CHUNK-RELATED ENDPOINTS');
      
      const chunkEndpoints = [
        '/chunks',
        '/task-chunks', 
        `/tasks/${sampleTask.id}/chunks`,
        '/progress',
        '/completion'
      ];
      
      const axios = require('axios');
      const { config } = require('./src/config');
      
      const client = axios.create({
        baseURL: config.motion.apiUrl,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.motion.apiKey
        }
      });
      
      for (const endpoint of chunkEndpoints) {
        try {
          const response = await client.get(endpoint);
          console.log(`✅ Found: ${endpoint}`);
          console.log(`Response keys:`, Object.keys(response.data));
        } catch (error) {
          console.log(`❌ ${endpoint}: ${error.response?.status || 'not found'}`);
        }
      }
    }
    
    console.log('\n3. ALTERNATIVE APPROACHES');
    
    console.log('\nAPPROACH A: Notion Progress Tracking');
    console.log('- Add "Progress %" number field to Notion');
    console.log('- Add "Hours Completed" number field');
    console.log('- Add "Hours Remaining" formula: Duration - Hours Completed');
    console.log('- Manual entry, but visible in Notion');
    
    console.log('\nAPPROACH B: Notion Sub-tasks');
    console.log('- Break large tasks into smaller sub-tasks in Notion');
    console.log('- Use "Parent item" / "Sub-item" relationships');
    console.log('- Each sub-task gets its own Motion sync');
    console.log('- Complete sub-tasks individually');
    
    console.log('\nAPPROACH C: Google Calendar Integration');
    console.log('- Motion can sync to Google Calendar');
    console.log('- Each Motion chunk appears as calendar event');
    console.log('- Mark calendar events as "completed" or add notes');
    console.log('- Would need to sync back to Notion');
    
    console.log('\nAPPROACH D: Time Tracking in Notion');
    console.log('- Add "Time Logs" related database');
    console.log('- Log work sessions with start/end times');
    console.log('- Calculate total time worked vs. estimated');
    console.log('- Show progress percentage automatically');
    
    console.log('\nAPPROACH E: Motion API Chunk Updates (if possible)');
    console.log('- If Motion API supports chunk updates');
    console.log('- Create Notion interface to mark chunks complete');
    console.log('- Sync completion status back to Motion');
    console.log('- Would need API endpoint testing');
    
    console.log('\n4. GOOGLE CALENDAR INTEGRATION');
    console.log('Checking if Motion events show up in Google Calendar...');
    console.log('(This would require Google Calendar API access)');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

exploreChunkCompletion();