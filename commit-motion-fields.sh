#!/bin/bash
cd /Users/andreavillani/notion-motion-sync
git add -A
git commit -m "Implement full Motion scheduling fields sync

Added support for syncing Motion scheduling data back to Notion:

1. Database schema:
   - Added start_on field (Notion → Motion)
   - Added 10 motion_* fields for Motion data

2. Notion → Motion:
   - Start On field now syncs to Motion's startOn constraint

3. Motion → Notion (read-only fields):
   - Motion Start On
   - Motion Scheduled Start/End (actual calendar times)
   - Motion Status
   - Motion Scheduling Issue
   - Motion Completed
   - Motion Deadline Type

4. Implementation:
   - Fast sync reads Start On from Notion
   - Slow sync sends startOn to Motion
   - After create/update, fetches full Motion task to capture scheduling data
   - Stores Motion fields in database
   - Fast sync writes Motion fields back to Notion

This gives full visibility into Motion's scheduling decisions while maintaining
the one-way flow for Motion-specific fields.

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin main