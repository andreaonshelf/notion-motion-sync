#!/usr/bin/env python3

import requests
import time
import json

# Phantom IDs found
phantom_tasks = [
    ("21d6c10e-5e22-804b-956f-facf282e8e58", "But isn't this the same as....", "Ho-z2IY7r7MS5fkcLWLlW"),
    ("21d6c10e-5e22-80c4-ae65-d0cff17cdd4c", "New Version of Pitch Deck", "ck1aHvcOaVgTY0Xxd37ZV"),
    ("21d6c10e-5e22-80ff-8010-e070eb6d0fff", "Create Pitch Script", "KetGzqHE-C_ac9ublkD9k"),
    ("21c6c10e-5e22-8196-b7cc-c54d5394d70b", "Rupert, Grietje, Umair as investor deck review", "l-AxCcjBu24uzmP6QM2_g"),
    ("21c6c10e-5e22-81fc-b55c-da10b09856ed", "Anna @ABI UK", "3cNdeOZkfnG9DkhSsCsAq"),
    ("21c6c10e-5e22-8187-bdff-cad1b89d04aa", "Grietje", "2aVamF-MehWX5TKLWfN2q"),
    ("21c6c10e-5e22-816e-a815-feab7aee1597", "Anna Fordkort", "S5AKaGWhox9Ns9RsQ0dUL"),
    ("21c6c10e-5e22-8175-8343-c51cb79ab181", "Onshelf - Survey v1", "FHBKDuaMYqogCF9Ct0TwZ"),
    ("21c6c10e-5e22-81d7-8326-e336427941c4", "Onshelf Client Discovery deck - Trade Marketing", "tLerQUWyfiDGhsPhBaLw5"),
    ("21c6c10e-5e22-81d9-8fb7-fa2ef4564ec9", "Benoit or Nom Watc: product / model", "7kx5Yy4TvoGEZQArablXj"),
    ("21c6c10e-5e22-81c3-84e2-f1da8ee513b4", "Den", "XnBOzgRDIvtCdp3TdnjnH")
]

print("🔧 Clearing phantom Motion IDs from Notion...")
print(f"Found {len(phantom_tasks)} tasks with phantom IDs\n")

# Load environment from .env file
import os
from pathlib import Path

env_path = Path(__file__).parent / '.env'
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            if '=' in line and not line.strip().startswith('#'):
                key, value = line.strip().split('=', 1)
                os.environ[key] = value.strip('"').strip("'")

NOTION_API_KEY = os.environ.get('NOTION_API_KEY')
if not NOTION_API_KEY:
    print("❌ NOTION_API_KEY not found in environment")
    exit(1)

headers = {
    "Authorization": f"Bearer {NOTION_API_KEY}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
}

fixed = 0
for notion_id, task_name, phantom_motion_id in phantom_tasks:
    print(f"Clearing phantom ID for: {task_name}")
    
    # Clear the Motion Task ID field in Notion
    url = f"https://api.notion.com/v1/pages/{notion_id}"
    data = {
        "properties": {
            "Motion Task ID": {
                "rich_text": []  # Clear the field
            }
        }
    }
    
    try:
        response = requests.patch(url, headers=headers, json=data)
        if response.status_code == 200:
            print(f"  ✓ Cleared Motion ID: {phantom_motion_id}")
            fixed += 1
        else:
            print(f"  ❌ Failed: {response.status_code} - {response.text[:100]}")
    except Exception as e:
        print(f"  ❌ Error: {str(e)}")
    
    time.sleep(0.5)  # Rate limit protection

print(f"\n✅ Fixed {fixed}/{len(phantom_tasks)} phantom IDs")
print("\nThe next sync will create proper Motion tasks for these items.")