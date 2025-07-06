require('dotenv').config();
const notionClient = require('./src/services/notionClient');

async function exploreBlockingFields() {
  try {
    console.log('Exploring "Blocking" and "Blocked by" fields in Notion...');
    
    const tasks = await notionClient.queryDatabase();
    
    // Check for tasks with blocking/blocked by data
    console.log('\n=== Checking existing blocking relationships ===');
    
    let hasBlockingData = false;
    
    for (const task of tasks.slice(0, 10)) {
      try {
        // Get raw page data to see blocking fields
        const rawPage = await notionClient.client.pages.retrieve({ page_id: task.id });
        const properties = rawPage.properties;
        
        const blocking = properties['Blocking'];
        const blockedBy = properties['Blocked by'];
        
        if ((blocking && blocking.relation && blocking.relation.length > 0) || 
            (blockedBy && blockedBy.relation && blockedBy.relation.length > 0)) {
          
          hasBlockingData = true;
          console.log(`\n${task.name}:`);
          
          if (blocking && blocking.relation && blocking.relation.length > 0) {
            console.log(`  Blocking: ${blocking.relation.length} task(s)`);
            blocking.relation.forEach((rel, i) => {
              console.log(`    - Task ID: ${rel.id}`);
            });
          }
          
          if (blockedBy && blockedBy.relation && blockedBy.relation.length > 0) {
            console.log(`  Blocked by: ${blockedBy.relation.length} task(s)`);
            blockedBy.relation.forEach((rel, i) => {
              console.log(`    - Task ID: ${rel.id}`);
            });
          }
        }
      } catch (error) {
        console.log(`  Error reading ${task.name}: ${error.message}`);
      }
    }
    
    if (!hasBlockingData) {
      console.log('No blocking relationships found in current tasks.');
    }
    
    // Check Motion API for dependency support
    console.log('\n=== Checking Motion API for dependency support ===');
    
    const motionClient = require('./src/services/motionClient');
    try {
      // Get a sample Motion task to see available fields
      const result = await motionClient.listTasks();
      if (result.tasks.length > 0) {
        const sampleTask = result.tasks[0];
        console.log('\nSample Motion task fields:');
        Object.keys(sampleTask).forEach(key => {
          if (key.toLowerCase().includes('block') || 
              key.toLowerCase().includes('depend') || 
              key.toLowerCase().includes('relation')) {
            console.log(`  - ${key}: ${sampleTask[key]}`);
          }
        });
        
        // Show all fields for analysis
        console.log('\nAll Motion task fields:');
        console.log(Object.keys(sampleTask).sort().join(', '));
      }
    } catch (error) {
      console.log(`Error checking Motion API: ${error.message}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

exploreBlockingFields();