const axios = require('axios');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';

async function testMotionFieldsDiagnostic() {
  try {
    console.log('Testing Motion fields diagnostic endpoint...\n');
    
    // 1. Get Motion fields diagnostic
    console.log('1. Fetching Motion fields diagnostic...');
    const diagnosticResponse = await axios.get(`${SERVER_URL}/diagnostic/motion-fields`);
    const diagnostic = diagnosticResponse.data;
    
    console.log('\n=== SUMMARY ===');
    console.log(`Total tasks: ${diagnostic.summary.totalTasks}`);
    console.log(`Tasks with Motion ID: ${diagnostic.summary.tasksWithMotionId}`);
    console.log(`Pending Notion updates: ${diagnostic.summary.pendingNotionUpdates}`);
    console.log(`Pending Motion operations: ${diagnostic.summary.pendingMotionOperations}`);
    console.log(`Scheduled tasks: ${diagnostic.summary.scheduledTasks}`);
    console.log(`Scheduled with Motion: ${diagnostic.summary.scheduledWithMotion}`);
    console.log(`Tasks with scheduled start: ${diagnostic.summary.tasksWithScheduledStart}`);
    console.log(`Tasks with scheduled end: ${diagnostic.summary.tasksWithScheduledEnd}`);
    
    console.log('\n=== TASKS WITH MOTION IDS ===');
    if (diagnostic.tasksWithMotionIds.length > 0) {
      diagnostic.tasksWithMotionIds.forEach(task => {
        console.log(`\nTask: ${task.notionName}`);
        console.log(`  Motion ID: ${task.motionId}`);
        console.log(`  Motion sync needed: ${task.motionSyncNeeded}`);
        console.log(`  Notion sync needed: ${task.notionSyncNeeded}`);
        console.log(`  Motion fields:`);
        console.log(`    - Scheduled start: ${task.motionFields.scheduledStart || 'null'}`);
        console.log(`    - Scheduled end: ${task.motionFields.scheduledEnd || 'null'}`);
        console.log(`    - Status: ${task.motionFields.status || 'null'}`);
        console.log(`    - Deadline type: ${task.motionFields.deadlineType || 'null'}`);
      });
    } else {
      console.log('No tasks with Motion IDs found');
    }
    
    console.log('\n=== TASKS NEEDING NOTION SYNC ===');
    if (diagnostic.tasksNeedingNotionSync.length > 0) {
      diagnostic.tasksNeedingNotionSync.forEach(task => {
        console.log(`\n${task.notion_name} (${task.notion_page_id})`);
        console.log(`  Motion ID: ${task.motion_task_id}`);
        console.log(`  Scheduled start: ${task.motion_scheduled_start || 'null'}`);
        console.log(`  Scheduled end: ${task.motion_scheduled_end || 'null'}`);
        console.log(`  Status: ${task.motion_status_name || 'null'}`);
      });
    } else {
      console.log('No tasks need Notion sync');
    }
    
    console.log('\n=== SCHEDULED TASKS WITHOUT MOTION FIELDS ===');
    if (diagnostic.scheduledTasksNoMotionFields.length > 0) {
      diagnostic.scheduledTasksNoMotionFields.forEach(task => {
        console.log(`\n${task.notion_name} (${task.notion_page_id})`);
        console.log(`  Motion ID: ${task.motion_task_id}`);
        console.log(`  Scheduled start: ${task.motion_scheduled_start || 'null'}`);
        console.log(`  Scheduled end: ${task.motion_scheduled_end || 'null'}`);
      });
    } else {
      console.log('No scheduled tasks missing Motion fields');
    }
    
    console.log('\n=== MOTION API SAMPLE ===');
    if (diagnostic.motionApiSample && !diagnostic.motionApiSample.error) {
      console.log(`Task: ${diagnostic.motionApiSample.notionName}`);
      console.log(`Motion ID: ${diagnostic.motionApiSample.motionId}`);
      console.log('\nDatabase fields:');
      console.log(`  - Scheduled start: ${diagnostic.motionApiSample.dbFields.scheduledStart || 'null'}`);
      console.log(`  - Scheduled end: ${diagnostic.motionApiSample.dbFields.scheduledEnd || 'null'}`);
      console.log(`  - Status: ${diagnostic.motionApiSample.dbFields.status || 'null'}`);
      console.log('\nMotion API response:');
      console.log(`  - Scheduled start: ${diagnostic.motionApiSample.motionApiResponse.scheduledStart || 'null'}`);
      console.log(`  - Scheduled end: ${diagnostic.motionApiSample.motionApiResponse.scheduledEnd || 'null'}`);
      console.log(`  - Status: ${diagnostic.motionApiSample.motionApiResponse.status?.name || 'null'}`);
      console.log(`  - Deadline type: ${diagnostic.motionApiSample.motionApiResponse.deadlineType || 'null'}`);
    } else if (diagnostic.motionApiSample?.error) {
      console.log(`Error: ${diagnostic.motionApiSample.error}`);
    } else {
      console.log('No Motion API sample available');
    }
    
    console.log('\n=== RECENT SYNC ACTIVITY ===');
    if (diagnostic.recentSyncActivity.length > 0) {
      diagnostic.recentSyncActivity.slice(0, 10).forEach(activity => {
        console.log(`\n${activity.time} - ${activity.action}`);
        if (activity.error) {
          console.log(`  Error: ${activity.error}`);
        }
      });
    } else {
      console.log('No recent sync activity');
    }
    
    // 2. Test refreshing Motion fields for a task
    if (diagnostic.tasksWithMotionIds.length > 0) {
      const testTask = diagnostic.tasksWithMotionIds[0];
      console.log(`\n\n=== TESTING MOTION FIELD REFRESH ===`);
      console.log(`Refreshing Motion fields for: ${testTask.notionName}`);
      
      try {
        const refreshResponse = await axios.post(
          `${SERVER_URL}/diagnostic/motion-fields/refresh/${testTask.notionPageId}`
        );
        const refreshData = refreshResponse.data;
        
        console.log('\nRefresh successful!');
        console.log('Updated fields:');
        console.log(`  - Scheduled start: ${refreshData.updatedFields.scheduledStart || 'null'}`);
        console.log(`  - Scheduled end: ${refreshData.updatedFields.scheduledEnd || 'null'}`);
        console.log(`  - Status: ${refreshData.updatedFields.status || 'null'}`);
        console.log(`  - Scheduling issue: ${refreshData.updatedFields.schedulingIssue}`);
        console.log(`  - Completed: ${refreshData.updatedFields.completed}`);
      } catch (error) {
        console.log(`\nRefresh failed: ${error.response?.data?.error || error.message}`);
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
  }
}

testMotionFieldsDiagnostic();