# Notion-Motion Sync Service

A Node.js service that provides bidirectional synchronization between Notion and Motion task management systems.

## Features

- **Webhook Support**: Listens for changes from both Notion and Motion
- **Bidirectional Sync**: Updates propagate in both directions
- **Status Mapping**: Automatically maps task statuses between platforms
- **Priority Mapping**: Converts priority levels between Notion and Motion
- **Error Handling**: Comprehensive logging and error recovery
- **Manual Sync**: API endpoints for triggering manual synchronization

## Setup

### 1. Prerequisites

- Node.js 18+ installed
- Motion API key
- Notion integration token and database ID

### 2. Notion Setup

1. Create a new integration at https://www.notion.so/my-integrations
2. Copy the integration token
3. Create or select a database with these properties:
   - Name (title)
   - Description (rich text)
   - Status (select: "Not started", "In progress", "Done", "Archived")
   - Priority (select: "High", "Medium", "Low")
   - Due Date (date)
   - Motion Task ID (rich text)
   - Last Synced (date) - Optional
4. Share the database with your integration

### 3. Environment Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your actual values:
- `MOTION_API_KEY`: Your Motion API key
- `NOTION_API_KEY`: Your Notion integration token
- `NOTION_DATABASE_ID`: Your Notion database ID
- `WEBHOOK_SECRET`: (Optional) Secret for webhook signature verification

### 4. Installation

```bash
npm install
```

### 5. Running the Service

Development:
```bash
npm run dev
```

Production:
```bash
npm start
```

## API Endpoints

### Health Check
- `GET /health` - Service health status

### Webhooks
- `POST /webhooks/notion` - Notion webhook endpoint
- `POST /webhooks/motion` - Motion webhook endpoint

### Manual Sync
- `POST /sync/full` - Perform full synchronization
- `POST /sync/notion/:pageId` - Sync specific Notion page
- `POST /sync/motion/:taskId` - Sync specific Motion task

## Deployment

### Railway

1. Push to GitHub
2. Connect repository to Railway
3. Add environment variables in Railway dashboard
4. Deploy

### Vercel

```bash
vercel --prod
```

### Docker

```bash
docker build -t notion-motion-sync .
docker run -p 3000:3000 --env-file .env notion-motion-sync
```

## Task Mapping

### Status Mapping
- Notion "Not started" ↔ Motion "TODO"
- Notion "In progress" ↔ Motion "IN_PROGRESS"
- Notion "Done" ↔ Motion "DONE"

### Priority Mapping
- Notion "High" ↔ Motion "HIGH"
- Notion "Medium" ↔ Motion "MEDIUM"
- Notion "Low" ↔ Motion "LOW"

### Document Handling
When Notion tasks contain file attachments:
- Motion task description includes a "📎 Documents in Notion" section
- Direct link to Notion page for accessing files
- Mobile-friendly format with tappable links
- Notion serves as the single source of truth for all documents

## Webhook Configuration

### Notion Webhooks
Configure your Notion integration to send webhooks to:
`https://your-domain.com/webhooks/notion`

### Motion Webhooks
Configure Motion to send webhooks to:
`https://your-domain.com/webhooks/motion`

## Troubleshooting

Check logs for detailed error information. The service uses Winston logger with different log levels based on NODE_ENV.

## Security

- Webhook signature verification (when WEBHOOK_SECRET is set)
- Environment-based configuration
- No hardcoded credentials
- CORS enabled for API access