# Schedule Checkbox Workflow

## Overview
The sync system now uses a **Schedule** checkbox in Notion to control which tasks are synced to Motion.

## How It Works

### 1. Database Setup
- Add a **Schedule** checkbox property to your Notion database
- The sync system tracks ALL Notion tasks in its database (not just filtered ones)
- Only tasks with `Schedule = checked` will be synced to Motion

### 2. Task Creation Flow
1. Create a task in Notion
2. Add duration (minutes)
3. Add due date
4. Check the **Schedule** checkbox when ready to sync to Motion
5. Within 3 minutes, the task will appear in Motion

### 3. Schedule Rules
- **Schedule checked**: Task syncs to Motion
- **Schedule unchecked**: Task removed from Motion (if it exists)
- **Re-checking Schedule**: Creates a new Motion task

### 4. Important Notes
- Motion is ONLY a scheduler - Notion is the source of truth
- Only tasks with Schedule = checked should exist in Motion
- The cleanup function will remove any Motion tasks that don't have Schedule = checked in Notion
- Tasks need both duration AND due date before checking Schedule (user's responsibility)

### 5. Monitoring
Check sync status at: `/diagnostic/schedule-status`

This shows:
- Total tasks in Notion
- How many are scheduled
- How many are ready (have duration + date)
- Which tasks are missing required fields