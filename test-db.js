require('dotenv').config();
const database = require('./src/database');

async function testDatabase() {
  try {
    console.log('Testing PostgreSQL connection...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    console.log('POSTGRES_HOST:', process.env.POSTGRES_HOST || 'localhost');
    console.log('POSTGRES_DB:', process.env.POSTGRES_DB || 'notion_motion_sync');
    
    await database.initialize();
    console.log('✅ Database initialized successfully');
    
    // Test basic operations
    const stats = await database.getStats();
    console.log('Database stats:', stats);
    
    // Test upsert
    const task = await database.upsertSyncTask('test-notion-id', {
      name: 'Test Task',
      lastEdited: new Date().toISOString()
    });
    console.log('✅ Created test task:', task.id);
    
    // Test getting tasks needing sync
    const needSync = await database.getTasksNeedingSync(5);
    console.log(`✅ Tasks needing sync: ${needSync.length}`);
    
    // Clean up
    await database.removeMapping('test-notion-id');
    console.log('✅ Cleaned up test task');
    
    await database.close();
    console.log('✅ All tests passed!');
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testDatabase();