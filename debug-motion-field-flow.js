require('dotenv').config();
const database = require('./src/database');
const motionClient = require('./src/services/motionClient');
const notionClient = require('./src/services/notionClient');
const logger = require('./src/utils/logger');

async function debugMotionFieldFlow() {
  try {
    await database.initialize();
    
    console.log('\n=== DEBUGGING MOTION FIELD FLOW ===\n');
    
    // 1. Get a task with Motion ID
    const taskWithMotionId = await database.get(`
      SELECT * FROM sync_tasks 
      WHERE motion_task_id IS NOT NULL 
      AND schedule_checkbox = true
      LIMIT 1
    `);
    
    if (!taskWithMotionId) {
      console.log('No scheduled task with Motion ID found');
      return;
    }
    
    console.log('1. Found task:', {
      name: taskWithMotionId.notion_name,
      notionPageId: taskWithMotionId.notion_page_id,
      motionTaskId: taskWithMotionId.motion_task_id
    });
    
    // 2. Check current Motion fields in database
    console.log('\n2. Current Motion fields in database:');
    console.log('   - motion_scheduled_start:', taskWithMotionId.motion_scheduled_start);
    console.log('   - motion_scheduled_end:', taskWithMotionId.motion_scheduled_end);
    console.log('   - motion_status_name:', taskWithMotionId.motion_status_name);
    console.log('   - motion_deadline_type:', taskWithMotionId.motion_deadline_type);
    console.log('   - notion_sync_needed:', taskWithMotionId.notion_sync_needed);
    
    // 3. Fetch fresh data from Motion API
    console.log('\n3. Fetching fresh data from Motion API...');
    try {
      const motionTask = await motionClient.getTask(taskWithMotionId.motion_task_id);
      console.log('   Motion API response:');
      console.log('   - id:', motionTask.id);
      console.log('   - name:', motionTask.name);
      console.log('   - scheduledStart:', motionTask.scheduledStart);
      console.log('   - scheduledEnd:', motionTask.scheduledEnd);
      console.log('   - status:', motionTask.status);
      console.log('   - deadlineType:', motionTask.deadlineType);
      console.log('   - schedulingIssue:', motionTask.schedulingIssue);
      
      // 4. Update Motion fields in database
      console.log('\n4. Updating Motion fields in database...');
      await database.updateMotionFields(taskWithMotionId.notion_page_id, motionTask);
      console.log('   ✓ Motion fields updated');
      
      // 5. Verify the update
      const updatedTask = await database.get(`
        SELECT * FROM sync_tasks 
        WHERE notion_page_id = $1
      `, [taskWithMotionId.notion_page_id]);
      
      console.log('\n5. Verified Motion fields after update:');
      console.log('   - motion_scheduled_start:', updatedTask.motion_scheduled_start);
      console.log('   - motion_scheduled_end:', updatedTask.motion_scheduled_end);
      console.log('   - motion_status_name:', updatedTask.motion_status_name);
      console.log('   - motion_deadline_type:', updatedTask.motion_deadline_type);
      console.log('   - notion_sync_needed:', updatedTask.notion_sync_needed);
      
      // 6. Check Notion properties
      console.log('\n6. Checking current Notion properties...');
      const notionPage = await notionClient.getTask(taskWithMotionId.notion_page_id);
      console.log('   Notion properties:');
      console.log('   - Name:', notionPage.name);
      console.log('   - Motion Task ID:', notionPage.motionTaskId);
      
      // Check if Motion fields exist in Notion
      const notionPageFull = await notionClient.client.pages.retrieve({ 
        page_id: taskWithMotionId.notion_page_id 
      });
      const properties = notionPageFull.properties;
      
      console.log('\n   Motion field properties in Notion:');
      console.log('   - Motion Scheduled Start exists:', !!properties['Motion Scheduled Start']);
      console.log('   - Motion Scheduled End exists:', !!properties['Motion Scheduled End']);
      console.log('   - Motion Status exists:', !!properties['Motion Status']);
      console.log('   - Motion Deadline Type exists:', !!properties['Motion Deadline Type']);
      
      if (properties['Motion Scheduled Start']) {
        console.log('   - Motion Scheduled Start value:', properties['Motion Scheduled Start']);
      }
      if (properties['Motion Scheduled End']) {
        console.log('   - Motion Scheduled End value:', properties['Motion Scheduled End']);
      }
      
      // 7. Simulate the update to Notion
      if (updatedTask.notion_sync_needed) {
        console.log('\n7. Task is marked for Notion sync. Simulating update...');
        
        const updateData = {
          motionTaskId: updatedTask.motion_task_id || '',
          motionStartOn: updatedTask.motion_start_on,
          motionScheduledStart: updatedTask.motion_scheduled_start,
          motionScheduledEnd: updatedTask.motion_scheduled_end,
          motionStatus: updatedTask.motion_status_name,
          motionSchedulingIssue: updatedTask.motion_scheduling_issue,
          motionCompleted: updatedTask.motion_completed,
          motionDeadlineType: updatedTask.motion_deadline_type
        };
        
        console.log('   Update data being sent to Notion:', updateData);
        
        try {
          await notionClient.updateTask(taskWithMotionId.notion_page_id, updateData);
          console.log('   ✓ Notion updated successfully');
          
          // Mark as synced
          await database.completeNotionSync(taskWithMotionId.notion_page_id);
          console.log('   ✓ Marked as synced in database');
        } catch (error) {
          console.log('   ✗ Error updating Notion:', error.message);
        }
      }
      
    } catch (error) {
      console.log('   Error fetching from Motion:', error.message);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await database.close();
  }
}

debugMotionFieldFlow();