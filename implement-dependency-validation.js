// PREVIEW: How sync-level dependency validation would work

async function validateDependencies(notionPageId) {
  try {
    // Get the task and its blocking relationships
    const task = await notionClient.getTask(notionPageId);
    
    if (!task.schedule) {
      return { canSync: true, reason: 'Task not scheduled' };
    }
    
    // Get raw page to check blocking relationships
    const rawPage = await notionClient.client.pages.retrieve({ page_id: notionPageId });
    const blockedByRelations = rawPage.properties['Blocked by']?.relation || [];
    
    if (blockedByRelations.length === 0) {
      return { canSync: true, reason: 'No dependencies' };
    }
    
    // Check each blocking task
    const unscheduledBlockers = [];
    
    for (const relation of blockedByRelations) {
      const blockerTask = await notionClient.getTask(relation.id);
      if (!blockerTask.schedule) {
        unscheduledBlockers.push(blockerTask.name);
      }
    }
    
    if (unscheduledBlockers.length > 0) {
      return {
        canSync: false,
        reason: `Blocked by unscheduled tasks: ${unscheduledBlockers.join(', ')}`,
        blockedBy: unscheduledBlockers
      };
    }
    
    return { canSync: true, reason: 'All dependencies scheduled' };
    
  } catch (error) {
    console.error('Dependency validation failed:', error.message);
    return { canSync: true, reason: 'Validation error - allowing sync' };
  }
}

// Example usage in sync service:
async function syncNotionToMotion(notionPageId) {
  const validation = await validateDependencies(notionPageId);
  
  if (!validation.canSync) {
    console.log(`⚠️ Sync blocked: ${validation.reason}`);
    
    // Optionally update a status field in Notion
    // await notionClient.updateTask(notionPageId, {
    //   syncStatus: `⚠️ ${validation.reason}`
    // });
    
    return;
  }
  
  // Proceed with normal sync
  console.log(`✅ Sync allowed: ${validation.reason}`);
  // ... rest of sync logic
}

console.log('This is a preview of how dependency validation would work in the sync service');