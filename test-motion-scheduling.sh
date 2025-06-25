#!/bin/bash

echo "🔍 Testing Motion scheduling behavior..."
echo ""
echo "This test will create a task with duration + date and check if it persists"
echo ""

# Source the .env file
cd ~/notion-motion-sync
source .env

# Create a test task with aggressive scheduling
TASK_NAME="Phantom Test $(date +%s)"
DUE_DATE=$(date -v+1d +%Y-%m-%d)  # Tomorrow

echo "Creating task: $TASK_NAME"
echo "Due date: $DUE_DATE"
echo "Duration: 480 minutes (8 hours)"
echo ""

# Create the task
RESPONSE=$(curl -s -X POST "https://api.usemotion.com/v1/tasks" \
  -H "X-API-Key: $MOTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$TASK_NAME\",
    \"workspaceId\": \"$MOTION_WORKSPACE_ID\",
    \"dueDate\": \"$DUE_DATE\",
    \"duration\": 480,
    \"priority\": \"HIGH\",
    \"description\": \"Testing phantom ID issue with large duration\"
  }")

TASK_ID=$(echo $RESPONSE | jq -r '.id')
echo "Created task with ID: $TASK_ID"

# Check immediately
echo ""
echo "Checking task immediately..."
CHECK1=$(curl -s -X GET "https://api.usemotion.com/v1/tasks/$TASK_ID" \
  -H "X-API-Key: $MOTION_API_KEY")

if [[ $CHECK1 == *"\"id\":"* ]]; then
  echo "✅ Task exists immediately after creation"
else
  echo "❌ Task NOT FOUND immediately after creation"
fi

# Wait 2 seconds
echo ""
echo "Waiting 2 seconds..."
sleep 2

# Check again
echo "Checking task after 2 seconds..."
CHECK2=$(curl -s -X GET "https://api.usemotion.com/v1/tasks/$TASK_ID" \
  -H "X-API-Key: $MOTION_API_KEY")

if [[ $CHECK2 == *"\"id\":"* ]]; then
  echo "✅ Task still exists after 2 seconds"
  # Clean up
  echo ""
  echo "Cleaning up test task..."
  curl -s -X DELETE "https://api.usemotion.com/v1/tasks/$TASK_ID" \
    -H "X-API-Key: $MOTION_API_KEY"
  echo "✓ Deleted"
else
  echo "❌ Task DISAPPEARED after 2 seconds!"
  echo "This confirms the phantom ID issue - Motion deletes tasks it can't schedule"
fi

echo ""
echo "Response details:"
echo "Initial response: $(echo $RESPONSE | jq -c '.')"
echo "Check after 2s: $(echo $CHECK2 | jq -c '.' 2>/dev/null || echo $CHECK2)"