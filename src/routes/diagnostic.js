const express = require('express');
const notionClient = require('../services/notionClient');
const motionClient = require('../services/motionClient');
const mappingCache = require('../services/mappingCache');
const syncService = require('../services/syncService');
const database = require('../database');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/notion-tasks', async (req, res) => {
  try {
    logger.info('Fetching all Notion tasks for diagnostic');
    
    // Query all tasks from Notion
    const notionTasks = await notionClient.queryDatabase();
    
    // Count tasks with Motion IDs
    const tasksWithMotionId = notionTasks.filter(task => task.motionTaskId);
    const tasksWithoutMotionId = notionTasks.filter(task => !task.motionTaskId);
    
    res.json({
      totalTasks: notionTasks.length,
      tasksWithMotionId: tasksWithMotionId.length,
      tasksWithoutMotionId: tasksWithoutMotionId.length,
      tasksWithMotionIdList: tasksWithMotionId.map(t => ({
        name: t.name,
        motionTaskId: t.motionTaskId,
        status: t.status,
        duration: t.duration,
        dueDate: t.dueDate,
        lastEdited: t.lastEdited
      })),
      recentTasks: notionTasks.slice(0, 5).map(t => ({
        name: t.name,
        motionTaskId: t.motionTaskId,
        status: t.status,
        duration: t.duration,
        id: t.id
      }))
    });
  } catch (error) {
    logger.error('Error in Notion diagnostic', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/schedule-status', async (req, res) => {
  try {
    // Get all Notion tasks
    const notionTasks = await notionClient.queryDatabase();
    
    // Categorize by schedule status
    const scheduled = notionTasks.filter(t => t.schedule);
    const notScheduled = notionTasks.filter(t => !t.schedule);
    
    // Check which scheduled tasks have all required fields
    const readyToSchedule = scheduled.filter(t => t.duration && t.dueDate);
    const missingFields = scheduled.filter(t => !t.duration || !t.dueDate);
    
    res.json({
      totalTasks: notionTasks.length,
      scheduled: {
        count: scheduled.length,
        readyToSchedule: readyToSchedule.length,
        missingFields: missingFields.length,
        missingFieldsList: missingFields.map(t => ({
          name: t.name,
          hasDuration: !!t.duration,
          hasDueDate: !!t.dueDate
        }))
      },
      notScheduled: {
        count: notScheduled.length,
        withMotionId: notScheduled.filter(t => t.motionTaskId).length
      },
      sample: scheduled.slice(0, 5).map(t => ({
        name: t.name,
        schedule: t.schedule,
        duration: t.duration,
        dueDate: t.dueDate,
        motionTaskId: t.motionTaskId
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/config-check', async (req, res) => {
  const { config } = require('../config');
  res.json({
    motion: {
      hasApiKey: !!config.motion.apiKey,
      apiKeyLength: config.motion.apiKey ? config.motion.apiKey.length : 0,
      workspaceId: config.motion.workspaceId,
      apiUrl: config.motion.apiUrl
    },
    notion: {
      hasApiKey: !!config.notion.apiKey,
      hasDatabaseId: !!config.notion.databaseId
    },
    environment: process.env.NODE_ENV
  });
});

router.get('/motion-sync-status', async (req, res) => {
  try {
    // Get Motion tasks
    const motionResponse = await motionClient.listTasks();
    const motionTasks = motionResponse.tasks || [];
    
    // Get Notion tasks with Motion IDs
    const notionTasks = await notionClient.queryDatabase();
    const notionMotionIds = new Set(
      notionTasks
        .filter(task => task.motionTaskId)
        .map(task => task.motionTaskId)
    );
    
    // Find which Motion tasks are missing from Notion
    const missingSyncTasks = motionTasks.filter(
      task => !notionMotionIds.has(task.id)
    );
    
    // Find Raycast task to check duration
    const raycastMotion = motionTasks.find(t => t.name === 'Raycast');
    
    res.json({
      motionTaskCount: motionTasks.length,
      notionTasksWithMotionId: notionMotionIds.size,
      missingInNotion: missingSyncTasks.length,
      syncPercentage: Math.round((notionMotionIds.size / motionTasks.length) * 100),
      raycastMotionDuration: raycastMotion ? raycastMotion.duration : 'Raycast not found',
      missingSample: missingSyncTasks.slice(0, 5).map(t => ({
        id: t.id,
        name: t.name,
        status: t.status?.name || t.status,
        duration: t.duration
      }))
    });
  } catch (error) {
    logger.error('Error in sync status diagnostic', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/cache-status', async (req, res) => {
  try {
    const stats = await mappingCache.getStats();
    res.json({
      cacheStats: stats,
      message: 'Cache is backed by SQLite database for persistence'
    });
  } catch (error) {
    logger.error('Error getting cache stats', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/recent-webhooks', (req, res) => {
  const webhookLog = require('../services/webhookLog');
  res.json({
    recentWebhooks: webhookLog.getRecent(20),
    message: 'Recent webhook events'
  });
});

router.get('/motion-task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await motionClient.getTask(taskId);
    res.json({
      task: {
        id: task.id,
        name: task.name,
        duration: task.duration,
        status: task.status,
        priority: task.priority,
        workspaceId: task.workspaceId,
        workspace: task.workspace,
        description: task.description?.substring(0, 100)
      }
    });
  } catch (error) {
    logger.error('Error fetching Motion task', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post('/force-sync-task/:taskName', async (req, res) => {
  try {
    const { taskName } = req.params;
    logger.info('FORCE SYNC: Starting sync for task', { taskName });
    
    // Get task from Notion
    const notionTasks = await notionClient.queryDatabase();
    const notionTask = notionTasks.find(t => t.name === taskName);
    
    if (!notionTask) {
      return res.status(404).json({ error: `Task ${taskName} not found in Notion` });
    }
    
    logger.info('FORCE SYNC: Found task in Notion', {
      name: notionTask.name,
      id: notionTask.id,
      motionTaskId: notionTask.motionTaskId,
      duration: notionTask.duration,
      dueDate: notionTask.dueDate
    });
    
    // Sync it
    await syncService.syncNotionToMotion(notionTask.id);
    
    // Check Motion after sync
    await new Promise(resolve => setTimeout(resolve, 2000));
    const motionTask = await motionClient.getTask(notionTask.motionTaskId);
    
    res.json({
      success: true,
      notion: {
        name: notionTask.name,
        duration: notionTask.duration,
        dueDate: notionTask.dueDate
      },
      motionAfterSync: {
        id: motionTask.id,
        duration: motionTask.duration,
        dueDate: motionTask.dueDate
      }
    });
  } catch (error) {
    logger.error('FORCE SYNC: Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

router.post('/force-sync-raycast', async (req, res) => {
  try {
    logger.info('FORCE SYNC: Starting Raycast sync');
    
    // Get Raycast from Notion
    const notionTasks = await notionClient.queryDatabase();
    const raycastNotion = notionTasks.find(t => t.name === 'Raycast');
    
    if (!raycastNotion) {
      return res.status(404).json({ error: 'Raycast not found in Notion' });
    }
    
    logger.info('FORCE SYNC: Found Raycast in Notion', {
      id: raycastNotion.id,
      motionTaskId: raycastNotion.motionTaskId,
      duration: raycastNotion.duration
    });
    
    // Sync it
    await syncService.syncNotionToMotion(raycastNotion.id);
    
    // Check Motion after sync
    await new Promise(resolve => setTimeout(resolve, 2000));
    const motionTask = await motionClient.getTask(raycastNotion.motionTaskId);
    
    res.json({
      success: true,
      notion: {
        id: raycastNotion.id,
        duration: raycastNotion.duration
      },
      motionAfterSync: {
        id: motionTask.id,
        duration: motionTask.duration
      }
    });
  } catch (error) {
    logger.error('FORCE SYNC: Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

router.post('/test-duration-update/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const duration = 90;
    
    logger.info('TEST: Updating duration directly', { taskId, duration });
    
    const result = await motionClient.updateTask(taskId, {
      duration: duration
    });
    
    res.json({
      success: true,
      taskId,
      duration,
      result: {
        id: result.id,
        name: result.name,
        duration: result.duration
      }
    });
  } catch (error) {
    logger.error('TEST: Error updating duration', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

router.get('/trial-tasks', async (req, res) => {
  try {
    // Get Motion tasks
    const motionResponse = await motionClient.listTasks();
    const motionTasks = motionResponse.tasks || [];
    
    // Get Notion tasks
    const notionTasks = await notionClient.queryDatabase();
    
    // Find all "trial" tasks
    const motionTrialTasks = motionTasks.filter(t => 
      t.name.toLowerCase().includes('trial')
    );
    
    const notionTrialTasks = notionTasks.filter(t => 
      t.name.toLowerCase().includes('trial')
    );
    
    res.json({
      motion: {
        count: motionTrialTasks.length,
        tasks: motionTrialTasks.map(t => ({
          id: t.id,
          name: t.name,
          status: t.status?.name || t.status
        }))
      },
      notion: {
        count: notionTrialTasks.length,
        tasks: notionTrialTasks.map(t => ({
          id: t.id,
          name: t.name,
          motionTaskId: t.motionTaskId,
          status: t.status
        }))
      }
    });
  } catch (error) {
    logger.error('Error in trial tasks diagnostic', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/database-stats', async (req, res) => {
  try {
    const stats = await database.getStats();
    const needingSync = await database.getTasksNeedingSync(10);
    
    res.json({
      stats,
      tasksNeedingSync: needingSync.length,
      needingSyncSample: needingSync.slice(0, 5).map(t => ({
        notion_page_id: t.notion_page_id,
        notion_name: t.notion_name,
        sync_status: t.sync_status,
        error_message: t.error_message,
        last_edited: t.notion_last_edited,
        last_synced: t.motion_last_synced
      }))
    });
  } catch (error) {
    logger.error('Error getting database stats', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/sync-history', async (req, res) => {
  try {
    const history = await database.all(
      'SELECT * FROM sync_history ORDER BY timestamp DESC LIMIT 50'
    );
    
    res.json({
      count: history.length,
      history: history.map(h => ({
        ...h,
        changes: h.changes ? JSON.parse(h.changes) : null
      }))
    });
  } catch (error) {
    logger.error('Error getting sync history', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/sync-history/:pageId', async (req, res) => {
  try {
    const { pageId } = req.params;
    const history = await database.all(
      'SELECT * FROM sync_history WHERE notion_page_id = $1 ORDER BY timestamp DESC LIMIT 20',
      [pageId]
    );
    
    res.json({
      count: history.length,
      history: history.map(h => ({
        ...h,
        changes: h.changes ? JSON.parse(h.changes) : null
      }))
    });
  } catch (error) {
    logger.error('Error getting sync history', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/database-errors', async (req, res) => {
  try {
    const errors = await database.all(`
      SELECT * FROM sync_tasks 
      WHERE sync_status = 'error' 
      ORDER BY updated_at DESC 
      LIMIT 20
    `);
    
    res.json({
      errorCount: errors.length,
      errors: errors.map(e => ({
        notion_page_id: e.notion_page_id,
        notion_name: e.notion_name,
        error_message: e.error_message,
        error_count: e.error_count,
        last_attempt: e.updated_at
      }))
    });
  } catch (error) {
    logger.error('Error getting database errors', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/test-motion-pagination', async (req, res) => {
  try {
    logger.info('Testing Motion pagination...');
    
    // Test WITH workspace filter
    const withWorkspace = await motionClient.client.get('/tasks', { 
      params: { workspaceId: require('../config').config.motion.workspaceId } 
    });
    
    // Test WITHOUT workspace filter
    const withoutWorkspace = await motionClient.client.get('/tasks', { 
      params: {} 
    });
    
    // Check if Stress Test is in either list
    const stressTestInFiltered = withWorkspace.data.tasks?.some(t => t.name === 'Stress Test Assumptions');
    const stressTestInAll = withoutWorkspace.data.tasks?.some(t => t.name === 'Stress Test Assumptions');
    
    res.json({
      withWorkspaceFilter: {
        taskCount: withWorkspace.data.tasks?.length || 0,
        hasCursor: !!withWorkspace.data.cursor,
        hasStressTest: stressTestInFiltered
      },
      withoutWorkspaceFilter: {
        taskCount: withoutWorkspace.data.tasks?.length || 0,
        hasCursor: !!withoutWorkspace.data.cursor,
        hasStressTest: stressTestInAll
      }
    });
  } catch (error) {
    logger.error('Motion pagination test failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post('/force-revalidate-all', async (req, res) => {
  try {
    // Force all tasks to be re-validated by setting last sync to old date
    const result = await database.pool.query(`
      UPDATE sync_tasks 
      SET motion_last_synced = NOW() - INTERVAL '31 minutes'
      WHERE motion_task_id IS NOT NULL
    `);
    
    res.json({
      success: true,
      tasksMarkedForRevalidation: result.rowCount
    });
  } catch (error) {
    logger.error('Error forcing revalidation', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post('/fix-scheduled-task-motion-id', async (req, res) => {
  try {
    // Clear Motion ID for scheduled task that has invalid Motion ID
    const result = await database.pool.query(`
      UPDATE sync_tasks 
      SET motion_task_id = NULL, 
          motion_sync_needed = true, 
          motion_priority = 1,
          motion_last_attempt = NULL
      WHERE schedule_checkbox = true 
        AND notion_name = 'New Version of Pitch Deck'
      RETURNING *
    `);
    
    res.json({
      success: true,
      fixed: result.rowCount,
      task: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/fix-broken-motion-ids', async (req, res) => {
  try {
    // Get all tasks with 404 errors
    const brokenTasks = await database.all(`
      SELECT * FROM sync_tasks 
      WHERE sync_status = 'error' 
      AND error_message LIKE '%404%'
    `);
    
    let fixed = 0;
    for (const task of brokenTasks) {
      try {
        // Clear Motion ID in Notion
        await notionClient.updateTask(task.notion_page_id, { motionTaskId: '' });
        
        // Clear Motion ID in database
        await database.pool.query(`
          UPDATE sync_tasks 
          SET motion_task_id = NULL, 
              sync_status = 'pending',
              error_message = NULL,
              error_count = 0
          WHERE notion_page_id = $1
        `, [task.notion_page_id]);
        
        // Clear from mapping cache
        await mappingCache.removeByNotionId(task.notion_page_id);
        
        fixed++;
        logger.info('Cleared broken Motion ID', { 
          taskName: task.notion_name,
          oldMotionId: task.motion_task_id 
        });
      } catch (error) {
        logger.error('Failed to fix broken Motion ID', { 
          task: task.notion_name, 
          error: error.message 
        });
      }
    }
    
    res.json({
      success: true,
      brokenTasksFound: brokenTasks.length,
      fixed: fixed,
      tasks: brokenTasks.map(t => ({
        name: t.notion_name,
        brokenMotionId: t.motion_task_id
      }))
    });
  } catch (error) {
    logger.error('Error fixing broken Motion IDs', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post('/test-motion-create', async (req, res) => {
  try {
    const testName = `Test Task ${new Date().toISOString()}`;
    logger.info('Testing Motion task creation', { testName });
    
    // Test 1: Create without duration
    const task1 = await motionClient.createTask({
      name: testName + ' - No Duration',
      description: 'Test task without duration',
      status: 'Not started',
      priority: 'Medium'
    });
    
    // Verify it exists
    let task1Exists = false;
    try {
      await motionClient.getTask(task1.id);
      task1Exists = true;
    } catch (e) {
      task1Exists = false;
    }
    
    // Test 2: Create with duration
    const task2 = await motionClient.createTask({
      name: testName + ' - With Duration',
      description: 'Test task with duration',
      status: 'Not started',
      priority: 'Medium',
      duration: 60
    });
    
    // Verify it exists
    let task2Exists = false;
    try {
      await motionClient.getTask(task2.id);
      task2Exists = true;
    } catch (e) {
      task2Exists = false;
    }
    
    // Test 3: Create with duration AND due date
    const task3 = await motionClient.createTask({
      name: testName + ' - Duration + Date',
      description: 'Test task with duration and due date',
      status: 'Not started',
      priority: 'Medium',
      duration: 60,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });
    
    // Verify it exists
    let task3Exists = false;
    try {
      await motionClient.getTask(task3.id);
      task3Exists = true;
    } catch (e) {
      task3Exists = false;
    }
    
    // Clean up - delete test tasks if they exist
    const cleanup = [];
    if (task1Exists) {
      try {
        await motionClient.deleteTask(task1.id);
        cleanup.push('task1');
      } catch (e) {}
    }
    if (task2Exists) {
      try {
        await motionClient.deleteTask(task2.id);
        cleanup.push('task2');
      } catch (e) {}
    }
    if (task3Exists) {
      try {
        await motionClient.deleteTask(task3.id);
        cleanup.push('task3');
      } catch (e) {}
    }
    
    res.json({
      success: true,
      results: {
        noDuration: {
          id: task1.id,
          created: task1Exists,
          isPhantom: !task1Exists
        },
        withDuration: {
          id: task2.id,
          created: task2Exists,
          isPhantom: !task2Exists
        },
        withDurationAndDate: {
          id: task3.id,
          created: task3Exists,
          isPhantom: !task3Exists
        }
      },
      cleanedUp: cleanup,
      workspaceId: require('../config').config.motion.workspaceId
    });
  } catch (error) {
    logger.error('Test Motion create failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get('/verify-phantom-ids', async (req, res) => {
  try {
    logger.info('Checking for phantom Motion IDs...');
    
    // Get all Notion tasks with Motion IDs
    const notionTasks = await notionClient.queryDatabase();
    const tasksWithMotionIds = notionTasks.filter(t => t.motionTaskId);
    
    // Check each Motion ID
    const phantomIds = [];
    const validIds = [];
    
    for (const task of tasksWithMotionIds) {
      try {
        const motionTask = await motionClient.getTask(task.motionTaskId);
        if (motionTask && motionTask.id === task.motionTaskId) {
          validIds.push({
            notionName: task.name,
            motionId: task.motionTaskId,
            motionName: motionTask.name
          });
        }
      } catch (error) {
        if (error.response?.status === 404) {
          phantomIds.push({
            notionId: task.id,
            notionName: task.name,
            phantomMotionId: task.motionTaskId,
            lastEdited: task.lastEdited
          });
        }
      }
    }
    
    res.json({
      totalChecked: tasksWithMotionIds.length,
      validMotionIds: validIds.length,
      phantomMotionIds: phantomIds.length,
      phantomTasks: phantomIds
    });
  } catch (error) {
    logger.error('Error verifying phantom IDs', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post('/test-workspace-creation', async (req, res) => {
  try {
    const { config } = require('../config');
    const testName = `Workspace Test ${Date.now()}`;
    
    // Test 1: Create with configured workspace
    let withWorkspace = null;
    try {
      const payload1 = {
        name: testName + ' - With WS',
        workspaceId: config.motion.workspaceId,
        duration: 60,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      };
      
      const response1 = await motionClient.client.post('/tasks', payload1);
      withWorkspace = response1.data;
    } catch (e) {
      withWorkspace = { error: e.message };
    }
    
    // Test 2: Create without workspace
    let withoutWorkspace = null;
    try {
      const payload2 = {
        name: testName + ' - No WS',
        duration: 60,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      };
      
      const response2 = await motionClient.client.post('/tasks', payload2);
      withoutWorkspace = response2.data;
    } catch (e) {
      withoutWorkspace = { error: e.message };
    }
    
    // Clean up if created
    const cleanup = [];
    if (withWorkspace && withWorkspace.id) {
      try {
        await motionClient.deleteTask(withWorkspace.id);
        cleanup.push('withWorkspace');
      } catch (e) {}
    }
    if (withoutWorkspace && withoutWorkspace.id) {
      try {
        await motionClient.deleteTask(withoutWorkspace.id);
        cleanup.push('withoutWorkspace');
      } catch (e) {}
    }
    
    res.json({
      configuredWorkspaceId: config.motion.workspaceId,
      withWorkspace: {
        success: !withWorkspace.error,
        id: withWorkspace.id,
        returnedWorkspaceId: withWorkspace.workspaceId,
        error: withWorkspace.error
      },
      withoutWorkspace: {
        success: !withoutWorkspace.error,
        id: withoutWorkspace.id,
        returnedWorkspaceId: withoutWorkspace.workspaceId,
        error: withoutWorkspace.error
      },
      cleanedUp: cleanup
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/check-phantom/:motionId', async (req, res) => {
  try {
    const { motionId } = req.params;
    logger.info('Checking phantom Motion ID', { motionId });
    
    // Try to get the task with the configured workspace
    let withWorkspace = null;
    try {
      const response = await motionClient.listTasks({ workspaceId: require('../config').config.motion.workspaceId });
      withWorkspace = response.tasks.find(t => t.id === motionId);
    } catch (e) {}
    
    // Try to get the task without workspace filter
    let withoutWorkspace = null;
    try {
      const response = await motionClient.listTasks({});
      withoutWorkspace = response.tasks.find(t => t.id === motionId);
    } catch (e) {}
    
    // Try direct GET
    let directGet = null;
    let directGetError = null;
    try {
      directGet = await motionClient.getTask(motionId);
    } catch (e) {
      directGetError = e.response?.status || e.message;
    }
    
    res.json({
      motionId,
      foundWithWorkspaceFilter: !!withWorkspace,
      foundWithoutWorkspaceFilter: !!withoutWorkspace,
      foundWithDirectGet: !!directGet,
      directGetError,
      taskDetails: directGet || withoutWorkspace || withWorkspace || null,
      configuredWorkspace: require('../config').config.motion.workspaceId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;