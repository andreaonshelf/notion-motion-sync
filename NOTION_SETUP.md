# Notion Integration Setup Fix

## Issue: New tasks aren't syncing to Motion

When you create a new task in Notion, you're seeing this error:
```
"Could not find page with ID: xxx. Make sure the relevant pages and databases are shared with your integration."
```

## Solution: Grant integration access to your database

1. **In Notion, go to your tasks database**

2. **Click the "..." menu in the top right of the database**

3. **Select "Connections" or "Add connections"**

4. **Find and add your "Notion-Motion Sync" integration**
   - If it's already there, remove it and re-add it
   - Make sure to grant it full access

5. **Important: Check the integration permissions**
   - The integration needs "Read content", "Update content", and "Insert content" permissions
   - It should have access to "No restrictions" for content capabilities

## Alternative: Share at workspace level

If the above doesn't work:

1. Go to Settings & Members → My connections
2. Find your Notion-Motion Sync integration  
3. Click on it and ensure it has access to your entire workspace or at least the parent page containing your database

## Test it

After fixing permissions:
1. Create a new task in Notion
2. It should appear in Motion within a few seconds
3. Check Railway logs - you should see successful sync messages instead of permission errors