require('dotenv').config();
const motionClient = require('./src/services/motionClient');

async function detailedMotionStatus() {
  try {
    console.log('🔍 DETAILED MOTION TASK STATUS CHECK\n');
    
    const result = await motionClient.listTasks();
    const tasks = result.tasks;
    
    console.log(`Found ${tasks.length} tasks in Motion:\n`);
    
    tasks.forEach((task, i) => {
      console.log(`${i + 1}. ${task.name} (ID: ${task.id})`);
      console.log(`   Status: "${task.status?.name}" (isResolved: ${task.status?.isResolvedStatus})`);
      console.log(`   Completed: ${task.completed}`);
      console.log(`   Completed Time: ${task.completedTime || 'null'}`);
      console.log(`   Updated Time: ${task.updatedTime}`);
      console.log(`   Priority: ${task.priority}`);
      console.log('');
    });
    
    // Check specifically for completed statuses
    const completedStatuses = tasks.filter(t => 
      t.completed === true || 
      t.status?.name === 'Completed' || 
      t.status?.name === 'Done' ||
      t.status?.isResolvedStatus === true
    );
    
    console.log('TASKS WITH COMPLETION INDICATORS:');
    if (completedStatuses.length === 0) {
      console.log('❌ No tasks found with completion indicators');
      console.log('\nPossible reasons:');
      console.log('1. Tasks were completed but not yet marked as "Completed" status');
      console.log('2. Motion removes completed tasks from API response');
      console.log('3. Completed tasks are in a different status name');
      console.log('4. Tasks were completed in chunks but overall task not complete');
    } else {
      completedStatuses.forEach(task => {
        console.log(`✅ ${task.name}`);
        console.log(`   Status: ${task.status?.name}`);
        console.log(`   Completed: ${task.completed}`);
        console.log(`   isResolvedStatus: ${task.status?.isResolvedStatus}`);
      });
    }
    
    // Check for all possible status names
    console.log('\nALL STATUS NAMES FOUND:');
    const uniqueStatuses = [...new Set(tasks.map(t => t.status?.name))];
    uniqueStatuses.forEach(status => {
      const count = tasks.filter(t => t.status?.name === status).length;
      console.log(`- "${status}": ${count} task(s)`);
    });
    
    // Check Motion task count vs yesterday
    console.log(`\nTOTAL MOTION TASKS: ${tasks.length}`);
    console.log('If you completed tasks but don\'t see them:');
    console.log('1. Check if Motion moved them to a "Completed" section');
    console.log('2. Check if Motion API excludes completed tasks by default');
    console.log('3. Try looking in Motion UI to confirm task status');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

detailedMotionStatus();