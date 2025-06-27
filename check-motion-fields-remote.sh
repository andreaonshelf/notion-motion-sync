#!/bin/bash

echo "Checking Motion fields in deployed database..."
echo ""

# First, check if the motion-fields endpoint exists
echo "=== Testing motion-fields endpoint ==="
curl -s https://notion-motion-sync-production.up.railway.app/motion-fields/motion-fields | jq

echo ""
echo "=== Checking a few diagnostic endpoints ==="

# Try diagnostic endpoint for notion tasks
echo "1. Notion tasks with Motion IDs:"
curl -s https://notion-motion-sync-production.up.railway.app/diagnostic/notion-tasks | jq '.tasksWithMotionIdList[] | select(.motionTaskId == "I8Y8VH3zQIyIkCgiWKW8k")'

echo ""
echo "2. Database mappings:"
curl -s https://notion-motion-sync-production.up.railway.app/diagnostic/mappings | jq '.mappings[] | select(.motionTaskId == "I8Y8VH3zQIyIkCgiWKW8k")'