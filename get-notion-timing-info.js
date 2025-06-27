require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

async function getNotionTimingInfo() {
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: 'Motion Task ID',
        rich_text: {
          is_not_empty: true
        }
      }
    });

    console.log('Notion Task Timing Information:');
    console.log('===============================\n');

    for (const page of response.results) {
      const title = page.properties['Name']?.title?.[0]?.text?.content || 'Untitled';
      const motionId = page.properties['Motion Task ID']?.rich_text?.[0]?.text?.content || '';
      const lastEdited = page.last_edited_time;
      const created = page.created_time;
      
      console.log(`Task: ${title}`);
      console.log(`Motion ID: ${motionId}`);
      console.log(`Page Created: ${new Date(created).toLocaleString()}`);
      console.log(`Last Edited: ${new Date(lastEdited).toLocaleString()}`);
      console.log(`Page ID: ${page.id}`);
      console.log('---\n');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

getNotionTimingInfo();