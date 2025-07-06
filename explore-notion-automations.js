require('dotenv').config();
const notionClient = require('./src/services/notionClient');

async function exploreNotionAutomations() {
  try {
    console.log('Exploring Notion automation possibilities for dependency checking...');
    
    // First, let's examine the database schema to understand the blocking relationships
    console.log('\n=== Checking database properties ===');
    
    const databaseInfo = await notionClient.client.databases.retrieve({
      database_id: notionClient.databaseId
    });
    
    const properties = databaseInfo.properties;
    
    console.log('\nAvailable properties:');
    Object.keys(properties).forEach(propName => {
      const prop = properties[propName];
      console.log(`- ${propName}: ${prop.type}`);
      
      if (prop.type === 'relation') {
        console.log(`  → Relation to: ${prop.relation.database_id}`);
        console.log(`  → Type: ${prop.relation.type || 'single'}`);
      }
    });
    
    // Check the blocking relationships specifically
    const blockingProp = properties['Blocking'];
    const blockedByProp = properties['Blocked by'];
    
    console.log('\n=== Blocking relationship analysis ===');
    if (blockingProp) {
      console.log('Blocking property:', JSON.stringify(blockingProp, null, 2));
    }
    if (blockedByProp) {
      console.log('Blocked by property:', JSON.stringify(blockedByProp, null, 2));
    }
    
    // Test a formula that could detect dependency issues
    console.log('\n=== Proposed formula for dependency validation ===');
    
    const formulaCode = `
    // Notion formula to check if task can be scheduled
    if(
      prop("Schedule") == true and 
      length(prop("Blocked by")) > 0,
      "⚠️ Check blocked dependencies",
      if(
        prop("Schedule") == true,
        "✅ Ready for Motion",
        "⏸️ Not scheduled"
      )
    )`;
    
    console.log('Formula for "Dependency Status" property:');
    console.log(formulaCode);
    
    // Check if we can programmatically create a formula property
    console.log('\n=== Testing formula property creation ===');
    
    try {
      // This would create a new formula property (commented out to avoid modification)
      console.log('Could add a "Dependency Status" formula property to show:');
      console.log('- ⚠️ Check blocked dependencies (when scheduled but has unscheduled blockers)');
      console.log('- ✅ Ready for Motion (when scheduled and no blockers)'); 
      console.log('- ⏸️ Not scheduled (when Schedule checkbox is false)');
      
    } catch (error) {
      console.log('Cannot programmatically add formula property:', error.message);
    }
    
    // Show how to check dependencies in our sync logic
    console.log('\n=== Sync-based validation approach ===');
    console.log('We could add validation in our sync service:');
    console.log('1. Before syncing a task to Motion');
    console.log('2. Check if it has "Blocked by" relationships');
    console.log('3. Query those related tasks to see if they\'re scheduled');
    console.log('4. Prevent Motion sync if dependencies are unscheduled');
    console.log('5. Log warning or update status in Notion');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

exploreNotionAutomations();