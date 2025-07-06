require('dotenv').config();
const notionClient = require('./src/services/notionClient');
const motionClient = require('./src/services/motionClient');

async function checkCompletedTasks() {
  try {
    console.log('🔄 CHECKING COMPLETED TASK SYNC STATUS\n');
    
    // Get Motion tasks to see completion status
    console.log('1. CHECKING MOTION TASKS...');
    const motionResult = await motionClient.listTasks();
    const motionTasks = motionResult.tasks;
    
    const completedMotionTasks = motionTasks.filter(task => 
      task.status?.name === 'Completed' || task.completed === true
    );
    
    console.log(`Found ${completedMotionTasks.length} completed tasks in Motion:`);
    completedMotionTasks.forEach(task => {
      console.log(`✅ ${task.name} (ID: ${task.id})`);
      console.log(`   Status: ${task.status?.name}`);
      console.log(`   Completed: ${task.completed}`);
      console.log(`   Completed Time: ${task.completedTime || 'not set'}`);
    });
    
    // Get Notion tasks to see their status
    console.log('\n2. CHECKING NOTION TASKS...');
    const notionTasks = await notionClient.queryDatabase();
    const notionTasksWithMotionIds = notionTasks.filter(t => t.motionTaskId);
    
    console.log(`Found ${notionTasksWithMotionIds.length} Notion tasks with Motion IDs:`);
    notionTasksWithMotionIds.forEach(task => {
      console.log(`📝 ${task.name} (Motion ID: ${task.motionTaskId})`);
      console.log(`   Status: ${task.status}`);
      console.log(`   Last edited: ${task.lastEdited}`);
    });
    
    // Cross-reference to find sync issues
    console.log('\n3. CROSS-REFERENCING COMPLETION STATUS...');
    
    let syncIssues = 0;
    
    completedMotionTasks.forEach(motionTask => {
      const correspondingNotionTask = notionTasksWithMotionIds.find(
        notionTask => notionTask.motionTaskId === motionTask.id
      );
      
      if (correspondingNotionTask) {
        if (correspondingNotionTask.status !== 'Done') {
          console.log(`❌ SYNC ISSUE: ${motionTask.name}`);
          console.log(`   Motion: Completed`);
          console.log(`   Notion: ${correspondingNotionTask.status}`);
          console.log(`   Should be: Done`);
          syncIssues++;
        } else {
          console.log(`✅ SYNCED: ${motionTask.name} - Both show completed`);
        }
      } else {
        console.log(`⚠️  ORPHAN: Motion task "${motionTask.name}" not found in Notion`);
      }
    });
    
    // Check for recently updated tasks
    console.log('\n4. CHECKING RECENT UPDATES...');
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    const recentlyUpdatedNotion = notionTasksWithMotionIds.filter(task => {
      const lastEdited = new Date(task.lastEdited);
      return lastEdited > fiveMinutesAgo;
    });
    
    console.log(`Tasks updated in Notion in last 5 minutes: ${recentlyUpdatedNotion.length}`);
    recentlyUpdatedNotion.forEach(task => {
      console.log(`🆕 ${task.name} - Updated: ${task.lastEdited}`);
    });
    
    if (syncIssues === 0 && completedMotionTasks.length > 0) {
      console.log('\n🎉 ALL COMPLETED TASKS ARE PROPERLY SYNCED!');
    } else if (syncIssues > 0) {
      console.log(`\n⚠️  FOUND ${syncIssues} SYNC ISSUES`);
      console.log('The manual sync should have fixed these.');
      console.log('Check Notion now to see if statuses updated.');
    } else if (completedMotionTasks.length === 0) {
      console.log('\n📝 NO COMPLETED TASKS FOUND IN MOTION');
      console.log('If you just completed tasks, they might not be marked as "Completed" status yet.');
    }
    
    // Check polling service status
    console.log('\n5. SYNC TIMING INFO...');
    console.log('⏰ Fast sync (Notion ↔ Database): Every 60 seconds');
    console.log('⏰ Slow sync (Database ↔ Motion): Every 3 minutes');
    console.log('🔄 Manual sync: Just triggered above');
    console.log('\nIf you completed tasks in Motion:');
    console.log('- Wait up to 3 minutes for automatic sync');
    console.log('- Or trigger manual sync via /sync/motion-to-notion');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkCompletedTasks();