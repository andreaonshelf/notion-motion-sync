require('dotenv').config();

const apiKey = process.env.MOTION_API_KEY;

console.log('API Key:', apiKey);
console.log('API Key length:', apiKey.length);
console.log('Contains special chars:', /[^\w\-=]/.test(apiKey));
console.log('Characters:', apiKey.split('').map(c => `${c} (${c.charCodeAt(0)})`).join(', '));

// Test if it's a valid header value
try {
  const headers = new Headers();
  headers.set('X-API-Key', apiKey);
  console.log('✅ Valid header value');
} catch (error) {
  console.log('❌ Invalid header value:', error.message);
}