#!/bin/bash

# Update Motion IDs for the 3 scheduled tasks in the Personal workspace
curl -X POST -H "Content-Type: application/json" \
  -d '{
    "updates": [
      {
        "notionPageId": "21d6c10e-5e22-80c4-ae65-d0cff17cdd4c",
        "motionTaskId": "3_spQ9abg9D4ydDcfhJTc",
        "taskName": "New Version of Pitch Deck"
      },
      {
        "notionPageId": "21c6c10e-5e22-80e6-b0c3-e1bcd95b41f1",
        "motionTaskId": "iMI3qVYFOjNur8GNC_5Aa",
        "taskName": "Stress Test Assumptions"
      },
      {
        "notionPageId": "21a6c10e-5e22-8006-b638-e15db9a24f95",
        "motionTaskId": "7iF7ZCDzu2hOsJMKcGg3S",
        "taskName": "Storyline for post: C6 acceptance"
      }
    ]
  }' \
  https://notion-motion-sync-production.up.railway.app/diagnostic/update-motion-ids

echo "Motion IDs updated"