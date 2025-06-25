#!/bin/bash

echo "🔍 Checking workspace configuration issue..."
echo ""

# Get all Motion tasks without workspace filter
echo "Getting all Motion tasks (no workspace filter)..."
ALL_TASKS=$(curl -s "https://api.usemotion.com/v1/tasks" \
  -H "X-API-Key: $MOTION_API_KEY" | jq '.tasks | length')

echo "Total tasks in all workspaces: $ALL_TASKS"

# Get tasks in configured workspace
echo ""
echo "Getting tasks in configured workspace..."
WORKSPACE_TASKS=$(curl -s "https://api.usemotion.com/v1/tasks?workspaceId=$MOTION_WORKSPACE_ID" \
  -H "X-API-Key: $MOTION_API_KEY" | jq '.tasks | length')

echo "Tasks in workspace $MOTION_WORKSPACE_ID: $WORKSPACE_TASKS"

# Get a sample task to see workspace info
echo ""
echo "Sample task details:"
curl -s "https://api.usemotion.com/v1/tasks" \
  -H "X-API-Key: $MOTION_API_KEY" | jq '.tasks[0] | {id, name, workspaceId, workspace}'