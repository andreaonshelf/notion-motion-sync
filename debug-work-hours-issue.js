require('dotenv').config();
const axios = require('axios');
const { config } = require('./src/config');

async function debugWorkHoursIssue() {
  try {
    console.log('🕛 DEBUGGING WHY MOTION IGNORES WORK HOURS (8 AM-7 PM)\n');
    
    const client = axios.create({
      baseURL: config.motion.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.motion.apiKey
      }
    });
    
    // Check if we can get workspace/user settings
    console.log('1. CHECKING MOTION WORKSPACE/USER SETTINGS...');
    
    try {
      const userResponse = await client.get('/user');
      console.log('✅ User endpoint found');
      console.log('User data keys:', Object.keys(userResponse.data));
      
      // Look for work hours, timezone, schedule settings
      const userData = userResponse.data;
      console.log('\n📊 USER SETTINGS:');
      
      if (userData.timezone) {
        console.log(`Timezone: ${userData.timezone}`);
      }
      
      if (userData.workHours) {
        console.log('Work Hours:', userData.workHours);
      }
      
      if (userData.schedule) {
        console.log('Schedule:', userData.schedule);
      }
      
      if (userData.preferences) {
        console.log('Preferences:', userData.preferences);
      }
      
      // Check for any work-related settings
      Object.keys(userData).forEach(key => {
        if (key.toLowerCase().includes('work') || 
            key.toLowerCase().includes('hour') || 
            key.toLowerCase().includes('schedule') ||
            key.toLowerCase().includes('time')) {
          console.log(`${key}:`, userData[key]);
        }
      });
      
    } catch (error) {
      console.log('❌ User endpoint:', error.response?.status || error.message);
    }
    
    // Check workspace settings
    try {
      const workspaceResponse = await client.get('/workspaces');
      console.log('\n✅ Workspaces endpoint found');
      
      if (workspaceResponse.data.workspaces) {
        const currentWorkspace = workspaceResponse.data.workspaces.find(w => w.id === config.motion.workspaceId);
        
        if (currentWorkspace) {
          console.log('\n📊 CURRENT WORKSPACE SETTINGS:');
          console.log('Workspace name:', currentWorkspace.name);
          
          // Look for schedule-related settings
          Object.keys(currentWorkspace).forEach(key => {
            if (key.toLowerCase().includes('work') || 
                key.toLowerCase().includes('hour') || 
                key.toLowerCase().includes('schedule') ||
                key.toLowerCase().includes('time')) {
              console.log(`${key}:`, currentWorkspace[key]);
            }
          });
          
          console.log('\nAll workspace keys:', Object.keys(currentWorkspace));
        }
      }
      
    } catch (error) {
      console.log('❌ Workspaces endpoint:', error.response?.status || error.message);
    }
    
    // Check if there are schedule-related endpoints
    console.log('\n2. CHECKING FOR SCHEDULE ENDPOINTS...');
    
    const scheduleEndpoints = [
      '/schedules',
      '/work-hours',
      '/user/schedule',
      '/user/work-hours',
      '/workspace/schedule',
      '/settings'
    ];
    
    for (const endpoint of scheduleEndpoints) {
      try {
        const response = await client.get(endpoint);
        console.log(`✅ Found: ${endpoint}`);
        console.log('Response keys:', Object.keys(response.data));
        
        // If it's a settings endpoint, show the data
        if (endpoint.includes('schedule') || endpoint.includes('work-hours') || endpoint.includes('settings')) {
          console.log('Data:', JSON.stringify(response.data, null, 2));
        }
        
      } catch (error) {
        console.log(`❌ ${endpoint}: ${error.response?.status || 'not found'}`);
      }
    }
    
    console.log('\n3. ANALYZING AUTO-SCHEDULING BEHAVIOR...');
    
    console.log('🤖 OUR CURRENT AUTO-SCHEDULING CONFIG:');
    console.log('payload.autoScheduled = {');
    console.log('  startDate: new Date().toISOString().split("T")[0], // Today');
    console.log('  deadlineType: "HARD",');
    console.log('  schedule: "Work"');
    console.log('};');
    
    console.log('\n❓ POSSIBLE ISSUES:');
    console.log('1. 🚫 "Work" schedule name doesn\'t match Motion\'s internal schedule');
    console.log('2. 🕐 Motion\'s work hours are set differently than expected');
    console.log('3. 📅 Hard deadlines override work hour constraints');
    console.log('4. 🤖 Auto-scheduling config is malformed or ignored');
    console.log('5. 🌍 Timezone mismatch between Motion and system');
    
    console.log('\n4. TESTING ALTERNATIVE SCHEDULE VALUES...');
    
    const scheduleOptions = [
      'Work',
      'work', 
      'WORK',
      'Business Hours',
      'Default',
      'PRIMARY',
      'Standard'
    ];
    
    console.log('Potential schedule values to try:');
    scheduleOptions.forEach(option => {
      console.log(`- "${option}"`);
    });
    
    console.log('\n🔧 NEXT STEPS:');
    console.log('1. Check Motion UI → Settings → Work Hours to see actual configured hours');
    console.log('2. Note the exact schedule name used in Motion');
    console.log('3. Test creating a task manually in Motion to see if it respects work hours');
    console.log('4. If Motion UI shows 8 AM-7 PM but API ignores it, this is a Motion API bug');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugWorkHoursIssue();