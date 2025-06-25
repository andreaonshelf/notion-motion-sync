#!/bin/bash

# Direct fix for phantom Motion IDs

echo "🔍 Found 11 phantom Motion IDs. Fixing them now..."
echo ""

# List of phantom IDs from the verification
phantom_tasks=(
  "21d6c10e-5e22-804b-956f-facf282e8e58"
  "21d6c10e-5e22-80c4-ae65-d0cff17cdd4c"
  "21d6c10e-5e22-80ff-8010-e070eb6d0fff"
  "21c6c10e-5e22-8196-b7cc-c54d5394d70b"
  "21c6c10e-5e22-81fc-b55c-da10b09856ed"
  "21c6c10e-5e22-8187-bdff-cad1b89d04aa"
  "21c6c10e-5e22-816e-a815-feab7aee1597"
  "21c6c10e-5e22-8175-8343-c51cb79ab181"
  "21c6c10e-5e22-81d7-8326-e336427941c4"
  "21c6c10e-5e22-81d9-8fb7-fa2ef4564ec9"
  "21c6c10e-5e22-81c3-84e2-f1da8ee513b4"
)

# Trigger sync for each phantom task to fix it
for task_id in "${phantom_tasks[@]}"; do
  echo "Fixing task: $task_id"
  curl -X POST -s "https://notion-motion-sync-production.up.railway.app/webhook/notion/$task_id" \
    -H "Content-Type: application/json" \
    -d '{"type": "page.updated"}'
  echo "✓"
  sleep 1  # Small delay to avoid rate limits
done

echo ""
echo "✅ Done! All phantom IDs have been queued for fixing."
echo ""
echo "The sync service will now:"
echo "1. Detect the Motion tasks don't exist (404)"
echo "2. Clear the phantom IDs"
echo "3. Create proper Motion tasks"
echo ""
echo "Check status in 1-2 minutes at:"
echo "https://notion-motion-sync-production.up.railway.app/diagnostic/verify-phantom-ids"