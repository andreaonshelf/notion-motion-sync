#!/bin/bash

echo "🔍 Finding notion-motion-sync processes..."

# Find processes
PROCESSES=$(ps aux | grep -E "(notion|motion|node.*index)" | grep -v grep)

if [ -n "$PROCESSES" ]; then
    echo "Found running processes:"
    echo "$PROCESSES"
    
    # Get PIDs
    PIDS=$(ps aux | grep -E "(notion|motion|node.*index)" | grep -v grep | awk '{print $2}')
    
    echo ""
    echo "🛑 Killing processes..."
    for PID in $PIDS; do
        echo "Killing PID: $PID"
        kill -9 $PID 2>/dev/null || echo "Could not kill $PID"
    done
    
    echo "Waiting 3 seconds..."
    sleep 3
else
    echo "No notion-motion processes found running"
fi

# Check port 3000
echo ""
echo "🔍 Checking port 3000..."
PORT_CHECK=$(lsof -i :3000 2>/dev/null)
if [ -n "$PORT_CHECK" ]; then
    echo "Something is running on port 3000:"
    echo "$PORT_CHECK"
    
    # Kill anything on port 3000
    echo "Killing processes on port 3000..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || echo "Could not kill port 3000 processes"
    sleep 2
else
    echo "Port 3000 is free"
fi

echo ""
echo "🚀 Starting notion-motion-sync server..."
cd /Users/andreavillani/notion-motion-sync

# Start server
nohup npm start > server.log 2>&1 &
PID=$!

echo "Server started with PID: $PID"
echo "Logs are being written to server.log"
echo ""
echo "✅ Server should now be running with the new workspace auto-detection!"
echo "Monitor logs with: tail -f /Users/andreavillani/notion-motion-sync/server.log"