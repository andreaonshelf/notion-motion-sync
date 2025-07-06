require('dotenv').config();
const motionClient = require('./src/services/motionClient');

async function debugSchedulingIssues() {
  try {
    console.log('Analyzing Motion tasks for scheduling issues...');
    
    const result = await motionClient.listTasks();
    const tasks = result.tasks;
    
    console.log(`\nAnalyzing ${tasks.length} Motion tasks:\n`);
    
    tasks.forEach(task => {
      const dueDate = new Date(task.dueDate);
      const scheduledEnd = task.scheduledEnd ? new Date(task.scheduledEnd) : null;
      const now = new Date();
      
      // Check for potential scheduling issues
      const isPastDue = dueDate < now;
      const isScheduledPastDue = scheduledEnd && scheduledEnd > dueDate;
      const hasNoScheduledTime = !task.scheduledStart || !task.scheduledEnd;
      const isOverdue = dueDate < now && task.status?.name !== 'Completed';
      
      console.log(`\n${task.name}:`);
      console.log(`  Due: ${task.dueDate} (${isPastDue ? 'PAST DUE' : 'future'})`);
      console.log(`  Scheduled: ${task.scheduledStart || 'none'} - ${task.scheduledEnd || 'none'}`);
      console.log(`  Status: ${task.status?.name}`);
      console.log(`  Motion schedulingIssue: ${task.schedulingIssue}`);
      console.log(`  Duration: ${task.duration} minutes`);
      console.log(`  DeadlineType: ${task.deadlineType}`);
      
      // Our analysis
      console.log(`  Analysis:`);
      console.log(`    - Past due: ${isPastDue}`);
      console.log(`    - Scheduled past due date: ${isScheduledPastDue}`);
      console.log(`    - No scheduled time: ${hasNoScheduledTime}`);
      console.log(`    - Overdue: ${isOverdue}`);
      
      // Check if there's a discrepancy
      const hasActualIssue = isPastDue || isScheduledPastDue || isOverdue;
      if (hasActualIssue && !task.schedulingIssue) {
        console.log(`    ⚠️  DISCREPANCY: Has scheduling issue but Motion API says false`);
      }
    });
    
    // Summary
    const tasksWithApiIssue = tasks.filter(t => t.schedulingIssue === true);
    const tasksWithActualIssues = tasks.filter(t => {
      const dueDate = new Date(t.dueDate);
      const scheduledEnd = t.scheduledEnd ? new Date(t.scheduledEnd) : null;
      const now = new Date();
      return dueDate < now || (scheduledEnd && scheduledEnd > dueDate);
    });
    
    console.log(`\n--- SUMMARY ---`);
    console.log(`Tasks with Motion API schedulingIssue=true: ${tasksWithApiIssue.length}`);
    console.log(`Tasks with actual scheduling issues: ${tasksWithActualIssues.length}`);
    
    if (tasksWithActualIssues.length > 0) {
      console.log(`\nTasks with actual issues:`);
      tasksWithActualIssues.forEach(t => {
        console.log(`- ${t.name}: due ${t.dueDate}, scheduled until ${t.scheduledEnd}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugSchedulingIssues();