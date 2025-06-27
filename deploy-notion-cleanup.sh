#!/bin/bash
cd /Users/andreavillani/notion-motion-sync
git add -A
git commit -m "Add Notion cleanup endpoint - database is source of truth for Motion IDs

- Detects stale Motion IDs in Notion that don't match database
- Clears phantom Motion IDs from Notion 
- Syncs correct Motion IDs from database to Notion
- Ensures database is authoritative for Notion state"
git push