require('dotenv').config();
const motionClient = require('./src/services/motionClient');

async function debugMidnightScheduling() {
  try {
    console.log('🕛 DEBUGGING MIDNIGHT SCHEDULING ISSUE\n');
    
    // Get all Motion tasks to see scheduling patterns
    const result = await motionClient.listTasks();
    const tasks = result.tasks;
    
    console.log(`Found ${tasks.length} Motion tasks. Checking for unusual scheduling...\n`);
    
    // Check for tasks scheduled outside normal hours
    const unusuallyScheduledTasks = [];
    
    tasks.forEach(task => {
      if (task.scheduledStart && task.scheduledEnd) {
        const startTime = new Date(task.scheduledStart);
        const endTime = new Date(task.scheduledEnd);
        
        // Check if scheduled outside 6 AM - 11 PM
        const startHour = startTime.getHours();
        const endHour = endTime.getHours();
        
        if (startHour < 6 || startHour >= 23 || endHour < 6 || endHour >= 24) {
          unusuallyScheduledTasks.push({
            name: task.name,
            startTime: task.scheduledStart,
            endTime: task.scheduledEnd,
            startHour,
            endHour,
            dueDate: task.dueDate,
            priority: task.priority,
            deadlineType: task.deadlineType
          });
        }
      }
    });
    
    console.log('🚨 TASKS SCHEDULED OUTSIDE NORMAL HOURS:');
    if (unusuallyScheduledTasks.length === 0) {
      console.log('✅ No tasks found scheduled outside 6 AM - 11 PM');
    } else {
      unusuallyScheduledTasks.forEach(task => {
        console.log(`\n❌ ${task.name}:`);
        console.log(`   Scheduled: ${new Date(task.startTime).toLocaleString()} - ${new Date(task.endTime).toLocaleString()}`);
        console.log(`   Hours: ${task.startHour}:00 - ${task.endHour}:00`);
        console.log(`   Due: ${task.dueDate}`);
        console.log(`   Priority: ${task.priority}`);
        console.log(`   Deadline Type: ${task.deadlineType}`);
        
        // Check if it's overdue
        const dueDate = new Date(task.dueDate);
        const now = new Date();
        if (dueDate < now) {
          console.log(`   ⚠️  OVERDUE: Due date has passed`);
        }
      });
    }
    
    console.log('\n📊 SCHEDULING ANALYSIS:');
    console.log('Common causes for midnight scheduling:');
    console.log('1. 🕐 Timezone mismatch between Motion and your system');
    console.log('2. ⚙️  Work hours not configured in Motion settings');
    console.log('3. 🚨 Overdue tasks forcing Motion to schedule ASAP');
    console.log('4. 📅 Hard deadlines requiring late-night work');
    console.log('5. 🤖 Auto-scheduling conflicts with calendar events');
    
    console.log('\n🔧 IMMEDIATE FIXES:');
    console.log('1. Check Motion → Settings → Work Hours');
    console.log('2. Verify timezone in Motion profile settings');
    console.log('3. Review task deadlines and priorities');
    console.log('4. Check for calendar conflicts during normal hours');
    
    // Check if any tasks are using our auto-scheduling config
    console.log('\n🤖 AUTO-SCHEDULING CONFIG CHECK:');
    console.log('Our sync sends auto-scheduling with:');
    console.log('- Schedule: "Work"');
    console.log('- DeadlineType: "HARD"');
    console.log('- StartDate: Today');
    
    console.log('\nIf Motion is ignoring work hours, the issue might be:');
    console.log('- "Work" schedule not properly configured in Motion');
    console.log('- Hard deadlines overriding work hour preferences');
    console.log('- Insufficient time available during work hours');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugMidnightScheduling();