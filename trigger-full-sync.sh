#!/bin/bash

echo "🔄 Triggering full sync to fix phantom IDs..."
echo ""

# Trigger a full sync
curl -X POST -s https://notion-motion-sync-production.up.railway.app/sync/full | jq '.'

echo ""
echo "✅ Full sync triggered!"
echo ""
echo "The sync will:"
echo "1. Process all tasks with phantom Motion IDs"
echo "2. Detect 404 errors and clear phantom IDs"
echo "3. Create proper Motion tasks"
echo ""
echo "Check progress in 30-60 seconds at:"
echo "https://notion-motion-sync-production.up.railway.app/diagnostic/verify-phantom-ids"