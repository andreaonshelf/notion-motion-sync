# Notion Webhook Setup Guide

This guide will walk you through setting up a webhook in Notion to receive real-time updates when changes occur in your Notion workspace.

## Prerequisites

Before you begin, make sure you have:
- A Notion account with admin access
- An existing Notion integration (if you don't have one, we'll create it in Step 1)
- The webhook URL: `https://notion-motion-sync.vercel.app/webhooks/notion`

## Step 1: Access Notion Integration Settings

1. **Open Notion** in your web browser
2. **Navigate to Settings & Members**:
   - Click on your workspace name in the top-left corner
   - Select "Settings & members" from the dropdown menu

3. **Go to the Integrations tab**:
   - In the left sidebar, click on "My integrations"
   - You'll see a list of your existing integrations

## Step 2: Create or Select an Integration

### If you need to create a new integration:

1. Click the "**+ New integration**" button
2. Fill in the integration details:
   - **Name**: Give it a descriptive name (e.g., "Motion Sync Webhook")
   - **Logo**: Optional - upload a logo if desired
   - **Associated workspace**: Select your workspace
   - **Capabilities**: Ensure the following are checked:
     - Read content
     - Update content (if needed)
     - Read comments
     - Read user information

3. Click "**Submit**" to create the integration
4. **Copy the Internal Integration Token** - you'll need this later

### If you already have an integration:

1. Click on your existing integration from the list
2. Make sure it has the necessary capabilities enabled

## Step 3: Add Webhook Subscription

1. **In the integration settings**, scroll down to find the "**Webhooks**" section
2. Click on "**+ Add subscription**" or "**Add webhook**" button
3. You'll see a form to configure your webhook

## Step 4: Configure the Webhook

Fill in the webhook configuration form:

1. **Webhook URL**: 
   ```
   https://notion-motion-sync.vercel.app/webhooks/notion
   ```
   ⚠️ **Important**: Copy and paste this URL exactly as shown

2. **Events to subscribe to**:
   Select the events you want to receive notifications for:
   - ✅ `page.created` - When a new page is created
   - ✅ `page.updated` - When a page is updated
   - ✅ `page.deleted` - When a page is deleted
   - ✅ `database.created` - When a new database is created
   - ✅ `database.updated` - When a database is updated
   - ✅ `block.created` - When a new block is created
   - ✅ `block.updated` - When a block is updated
   - ✅ `block.deleted` - When a block is deleted

3. **Secret** (optional but recommended):
   - Generate a secure secret key for webhook verification
   - You can use a password generator or create a random string
   - Save this secret - you'll need it for your application

## Step 5: Verify the Webhook

After entering the webhook URL and selecting events:

1. Click "**Create subscription**" or "**Save**"
2. Notion will immediately attempt to verify your webhook endpoint
3. **Verification process**:
   - Notion sends a POST request to your webhook URL
   - The request includes a `challenge` parameter in the body
   - Your endpoint must respond with:
     - Status code: `200`
     - Content-Type: `application/json`
     - Body: `{ "challenge": "<the_challenge_value_from_request>" }`

4. **Verification status**:
   - ✅ **Success**: You'll see a green checkmark and "Verified" status
   - ❌ **Failed**: You'll see an error message

## Step 6: Troubleshooting Webhook Verification

If verification fails, check these common issues:

### 1. **Endpoint not accessible**
- Ensure your server is running and publicly accessible
- Check that the URL is correct: `https://notion-motion-sync.vercel.app/webhooks/notion`
- Verify there are no typos in the URL

### 2. **Incorrect response format**
Your endpoint must:
- Accept POST requests
- Parse the JSON body
- Return the challenge value in the correct format

Example verification response code:
```javascript
// Example Node.js/Express endpoint
app.post('/webhooks/notion', (req, res) => {
  // Check if this is a verification request
  if (req.body.type === 'url_verification') {
    // Respond with the challenge
    return res.status(200).json({
      challenge: req.body.challenge
    });
  }
  
  // Handle actual webhook events here
  // ...
});
```

### 3. **SSL/HTTPS issues**
- Notion requires webhooks to use HTTPS
- Ensure your SSL certificate is valid
- The domain must be publicly accessible (not localhost)

### 4. **Response timeout**
- Your endpoint must respond within 3 seconds
- Ensure your verification logic is simple and fast

## Step 7: Test Your Webhook

Once verified, test that your webhook is working:

1. **Make a test change** in Notion:
   - Create a new page in a connected database
   - Edit an existing page
   - Add or modify a block

2. **Check your webhook endpoint**:
   - You should receive POST requests at your webhook URL
   - Each request contains event data in JSON format

3. **Monitor webhook activity**:
   - In Notion integration settings, you can see webhook delivery logs
   - Check for successful deliveries (200 status codes)
   - Review any failed deliveries and error messages

## Step 8: Connect Pages and Databases

For your webhook to receive events, you need to give your integration access to specific pages or databases:

1. **Open the page or database** you want to monitor in Notion
2. Click the "**•••**" menu in the top-right corner
3. Select "**Add connections**" or "**Connections**"
4. Click "**Add connection**"
5. Search for and select your integration
6. The integration now has access to this page/database and will receive webhook events

## Important Notes

- **Rate limits**: Notion may rate-limit webhook deliveries if you receive too many events
- **Retry policy**: Failed webhook deliveries are retried with exponential backoff
- **Security**: Always verify webhook signatures if you configured a secret
- **Payload size**: Webhook payloads can be large, ensure your endpoint can handle them

## Webhook Event Structure

Example webhook payload:
```json
{
  "id": "event-id",
  "type": "page.updated",
  "page": {
    "id": "page-id",
    "created_time": "2024-01-01T00:00:00.000Z",
    "last_edited_time": "2024-01-01T00:00:00.000Z",
    "properties": {
      // Page properties
    }
  },
  "workspace_id": "workspace-id",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Next Steps

After successfully setting up your webhook:

1. Implement proper webhook handling in your application
2. Add webhook signature verification for security
3. Set up error handling and logging
4. Consider implementing a queue system for processing webhook events
5. Monitor webhook performance and adjust as needed

## Support

If you encounter issues:
- Check the [Notion API documentation](https://developers.notion.com/docs/working-with-webhooks)
- Review webhook logs in your Notion integration settings
- Ensure your endpoint follows all requirements listed above