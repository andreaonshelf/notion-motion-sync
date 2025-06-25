#!/bin/bash

echo "🔍 Testing Motion API behavior with duration + date tasks..."
echo ""

# Test creating a task exactly like Notion would
curl -X POST -s "https://notion-motion-sync-production.up.railway.app/diagnostic/test-motion-create" | jq '.'

echo ""
echo "Now let's check for any phantom IDs..."
curl -s "https://notion-motion-sync-production.up.railway.app/diagnostic/verify-phantom-ids" | jq '{total: .totalChecked, phantom: .phantomMotionIds}'

echo ""
echo "Checking database errors..."
curl -s "https://notion-motion-sync-production.up.railway.app/diagnostic/database-errors" | jq '.'