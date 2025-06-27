# Motion Task Timing Summary

## Overview

Based on the API responses and database queries, here's the comprehensive timing information for Motion tasks:

## Tasks Created Today (June 27, 2025)

| Task Name | Motion ID | Motion Created | DB Entry | Notion Updated | Time to Notion |
|-----------|-----------|----------------|----------|----------------|----------------|
| Storyline for post: C6 acceptance | LUgdviPVOxzf3LTFduy6Z | 2025-06-27 08:52:26 | 2025-06-25 23:13:06* | 2025-06-27 09:06:00 | ~14 minutes |
| New Version of Pitch Deck | ffIiADxCqIo7JcNliquB7 | 2025-06-27 08:52:23 | 2025-06-25 23:13:06* | 2025-06-27 09:06:00 | ~14 minutes |
| Stress Test Assumptions | tCXeuUAVjkJqR2U1Jrc62 | 2025-06-27 08:52:20 | 2025-06-25 23:13:06* | 2025-06-27 09:06:00 | ~14 minutes |
| Peekakutcha | kLEAV1_uRD7laPnhCjX2e | 2025-06-27 08:01:43 | 2025-06-26 12:43:11 | 2025-06-27 09:06:00 | ~64 minutes |

*Note: These database entries predate the Motion creation time, indicating they were existing Notion tasks that got new Motion IDs today.

## Key Findings

1. **Motion Task Creation Times**: All tasks except Peekakutcha were created in Motion this morning around 8:52 AM BST.

2. **Database Sync**: The database shows these tasks existed before today, suggesting they were:
   - Originally created in Notion
   - Had previous Motion IDs that were cleaned up (see orphan_cleanup events)
   - Got new Motion IDs assigned today

3. **Sync Performance**: 
   - Tasks created around 8:52 AM were synced to Notion by 9:06 AM
   - This represents approximately 14 minutes from Motion creation to Notion update
   - The Peekakutcha task took longer (~64 minutes) possibly due to being created earlier

4. **Sync History**: The database shows extensive "orphan_cleanup" events from June 25-27, indicating:
   - Previous Motion tasks were deleted or became orphaned
   - The system cleaned up these orphaned IDs
   - New Motion tasks were created today with fresh IDs

## Current Status (as of 9:06 AM BST)

- All 4 tasks have valid Motion IDs
- All Motion IDs are successfully written to Notion
- 3 tasks show sync_status: "synced" in the database
- 1 task (Peekakutcha) shows sync_status: "pending" despite having a Motion ID

## Database vs Motion API Discrepancy

The database entries predate the Motion API creation times, which suggests:
1. These were existing Notion tasks
2. They previously had different Motion IDs (now cleaned up as orphans)
3. New Motion tasks were created today and linked to the existing Notion pages
4. The sync process successfully updated Notion with the new Motion IDs within 14-64 minutes