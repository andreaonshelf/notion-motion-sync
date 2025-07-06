#!/bin/bash

echo "🔧 Applying fixes for reliable task processing..."
echo "Fixed issues:"
echo "- Increased batch size from 5 to 20 tasks"
echo "- Reduced retry interval from 2 minutes to 1 minute"
echo "- Added detailed logging for each task operation"
echo "- Improved error handling to not block other tasks"
echo "- Added success/error counters"
echo ""

echo "🛑 Stopping current server..."
pkill -f "node.*index.js" 2>/dev/null || echo "No existing server found"

echo "Waiting 3 seconds..."
sleep 3

echo "🚀 Starting server with fixes..."
cd /Users/andreavillani/notion-motion-sync
npm start