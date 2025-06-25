#!/bin/bash

echo "🔍 Debugging phantom ID creation process..."
echo ""

# Test 1: Create a task and immediately check multiple ways
echo "Test 1: Creating a task with duration + date via API..."
RESULT=$(curl -X POST -s "https://notion-motion-sync-production.up.railway.app/diagnostic/test-motion-create" | jq '.')

echo "Results:"
echo "$RESULT" | jq '.results.withDurationAndDate'

PHANTOM_ID=$(echo "$RESULT" | jq -r '.results.withDurationAndDate.id')
echo ""
echo "Got ID: $PHANTOM_ID"

if [ "$PHANTOM_ID" != "null" ]; then
  echo ""
  echo "Checking if this ID can be found..."
  curl -s "https://notion-motion-sync-production.up.railway.app/diagnostic/check-phantom/$PHANTOM_ID" | jq '.'
fi

echo ""
echo "Test 2: Checking current phantom IDs..."
curl -s "https://notion-motion-sync-production.up.railway.app/diagnostic/verify-phantom-ids" | jq '{
  total: .totalChecked,
  phantom: .phantomMotionIds,
  sample: .phantomTasks[0]
}'

echo ""
echo "Test 3: Checking a known phantom ID..."
# Use one of the previously known phantom IDs
curl -s "https://notion-motion-sync-production.up.railway.app/diagnostic/check-phantom/Ho-z2IY7r7MS5fkcLWLlW" | jq '.'