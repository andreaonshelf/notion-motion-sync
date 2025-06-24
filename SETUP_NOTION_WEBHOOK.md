# Setting Up Notion Webhook - Quick Guide

Your webhook endpoint is ready at:
**https://notion-motion-sync.vercel.app/webhooks/notion**

## Steps to Enable Notion Webhook:

### 1. Go to Your Notion Integration
Visit: https://www.notion.so/my-integrations

### 2. Select Your Integration
Click on "Motion Sync" (or whatever you named it)

### 3. Go to Webhooks Tab
Click on the "Webhooks" tab in your integration settings

### 4. Create Subscription
Click "+ Create a subscription"

### 5. Configure Webhook
- **Webhook URL**: `https://notion-motion-sync.vercel.app/webhooks/notion`
- **Event types**: Select these:
  - `page.content_updated`
  - `page.property_values_updated`
  - `page.created`

### 6. Create and Verify
1. Click "Create subscription"
2. Notion will send a verification token to your endpoint
3. Check your Vercel logs to see the token:
   ```bash
   vercel logs notion-motion-sync --follow
   ```
4. Look for a log like: "Notion webhook verification request received"
5. Copy the verification token from the logs
6. Paste it back in Notion's verification dialog
7. Click "Verify subscription"

### 7. Test It!
- Edit a task in your Notion database
- Within seconds, it should sync to Motion
- No more 5-minute waits!

## Troubleshooting

If verification fails:
1. Make sure your service is deployed (check: `curl https://notion-motion-sync.vercel.app/health`)
2. Check logs: `vercel logs notion-motion-sync`
3. Ensure the webhook URL is exactly: `https://notion-motion-sync.vercel.app/webhooks/notion`

## For Motion
Since Motion doesn't support webhooks, we'll keep the polling for Motion only. But at least Notion changes will sync instantly!