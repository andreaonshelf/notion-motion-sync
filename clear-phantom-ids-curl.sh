#!/bin/bash

echo "🔧 Clearing phantom Motion IDs directly via Notion API..."
echo ""

# Load NOTION_API_KEY from .env
source .env

# Phantom task IDs
declare -a phantom_ids=(
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

fixed=0
for notion_id in "${phantom_ids[@]}"; do
  echo "Clearing phantom ID for page: $notion_id"
  
  response=$(curl -s -X PATCH "https://api.notion.com/v1/pages/$notion_id" \
    -H "Authorization: Bearer $NOTION_API_KEY" \
    -H "Notion-Version: 2022-06-28" \
    -H "Content-Type: application/json" \
    -d '{
      "properties": {
        "Motion Task ID": {
          "rich_text": []
        }
      }
    }')
  
  if [[ $response == *'"object":"page"'* ]]; then
    echo "  ✓ Cleared"
    ((fixed++))
  else
    echo "  ❌ Failed"
  fi
  
  sleep 0.5
done

echo ""
echo "✅ Fixed $fixed/${#phantom_ids[@]} phantom IDs"
echo ""
echo "Now triggering a full sync..."
curl -X POST -s "https://notion-motion-sync-production.up.railway.app/sync/full" | jq '.'