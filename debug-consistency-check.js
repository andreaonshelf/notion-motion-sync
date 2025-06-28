require('dotenv').config();
const database = require('./src/database');
const notionClient = require('./src/services/notionClient');
const logger = require('./src/utils/logger');

async function debugConsistencyCheck() {
  try {
    await database.initialize();
    
    console.log('\n=== DEBUGGING CONSISTENCY CHECK ===\n');
    
    // 1. Check what Notion actually has
    console.log('1. CHECKING NOTION DATA...');
    const notionTasks = await notionClient.queryDatabase();
    const scheduledTasks = notionTasks.filter(task => task.schedule);
    
    console.log(`Found ${scheduledTasks.length} scheduled tasks in Notion:`);
    scheduledTasks.forEach(task => {
      console.log(`  - ${task.name}: Motion ID = "${task.motionTaskId || 'NULL'}"`);
    });
    
    // 2. Check what Database actually has  
    console.log('\n2. CHECKING DATABASE DATA...');
    const dbTasks = await database.all(`
      SELECT notion_page_id, notion_name, motion_task_id, schedule_checkbox, notion_sync_needed
      FROM sync_tasks 
      WHERE schedule_checkbox = true
      ORDER BY notion_name
    `);
    
    console.log(`Found ${dbTasks.length} scheduled tasks in database:`);
    dbTasks.forEach(task => {
      console.log(`  - ${task.notion_name}: Motion ID = "${task.motion_task_id || 'NULL'}", notion_sync_needed = ${task.notion_sync_needed}`);
    });
    
    // 3. Compare for mismatches
    console.log('\n3. CHECKING FOR MISMATCHES...');
    let mismatchCount = 0;
    
    for (const notionTask of scheduledTasks) {
      const dbTask = dbTasks.find(db => db.notion_page_id === notionTask.id);
      
      if (!dbTask) {
        console.log(`  ❌ MISMATCH: Notion task "${notionTask.name}" not found in database`);
        mismatchCount++;
        continue;
      }
      
      const notionMotionId = notionTask.motionTaskId || null;
      const dbMotionId = dbTask.motion_task_id || null;
      
      if (notionMotionId !== dbMotionId) {
        console.log(`  ❌ MISMATCH: "${notionTask.name}"`);
        console.log(`    Notion has: "${notionMotionId}"`);
        console.log(`    Database has: "${dbMotionId}"`);
        console.log(`    notion_sync_needed: ${dbTask.notion_sync_needed}`);
        mismatchCount++;
      } else {
        console.log(`  ✅ MATCH: "${notionTask.name}" - both have "${notionMotionId}"`);
      }
    }
    
    console.log(`\nTotal mismatches found: ${mismatchCount}`);
    
    // 4. Check if any tasks are pending Notion sync
    console.log('\n4. CHECKING PENDING NOTION SYNCS...');
    const pendingSync = await database.all(`
      SELECT notion_page_id, notion_name, motion_task_id, notion_sync_needed
      FROM sync_tasks 
      WHERE notion_sync_needed = true
      ORDER BY notion_name
    `);
    
    console.log(`Found ${pendingSync.length} tasks pending Notion sync:`);
    pendingSync.forEach(task => {
      console.log(`  - ${task.notion_name}: Motion ID = "${task.motion_task_id || 'NULL'}"`);
    });
    
    if (mismatchCount > 0 && pendingSync.length === 0) {
      console.log('\n⚠️  PROBLEM: Mismatches detected but no tasks marked for Notion sync!');
      console.log('This means the fast sync mismatch detection is NOT working.');
    }
    
  } catch (error) {
    console.error('\nError:', error.message);
    if (error.stack) console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

debugConsistencyCheck();