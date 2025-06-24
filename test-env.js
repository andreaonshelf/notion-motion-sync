// Simple test to check environment variables
console.log('=== Environment Variable Test ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('\nMotion Variables:');
console.log('MOTION_API_KEY exists:', !!process.env.MOTION_API_KEY);
console.log('MOTION_API_KEY length:', process.env.MOTION_API_KEY ? process.env.MOTION_API_KEY.length : 0);
console.log('MOTION_WORKSPACE_ID exists:', !!process.env.MOTION_WORKSPACE_ID);
console.log('MOTION_WORKSPACE_ID:', process.env.MOTION_WORKSPACE_ID);
console.log('\nNotion Variables:');
console.log('NOTION_API_KEY exists:', !!process.env.NOTION_API_KEY);
console.log('NOTION_API_KEY length:', process.env.NOTION_API_KEY ? process.env.NOTION_API_KEY.length : 0);
console.log('NOTION_DATABASE_ID exists:', !!process.env.NOTION_DATABASE_ID);
console.log('NOTION_DATABASE_ID:', process.env.NOTION_DATABASE_ID);
console.log('\nAll env keys containing MOTION or NOTION:');
Object.keys(process.env).forEach(key => {
  if (key.includes('MOTION') || key.includes('NOTION')) {
    console.log(`- ${key}`);
  }
});