const express = require('express');
const { config } = require('./config');

const app = express();

app.get('/debug-env', (req, res) => {
  const apiKey = process.env.MOTION_API_KEY;
  
  res.json({
    hasKey: !!apiKey,
    keyLength: apiKey ? apiKey.length : 0,
    keyChars: apiKey ? apiKey.split('').map((c, i) => ({
      position: i,
      char: c,
      charCode: c.charCodeAt(0),
      isSpecial: c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126
    })) : [],
    rawValue: apiKey,
    trimmedLength: apiKey ? apiKey.trim().length : 0
  });
});

app.listen(3001, () => {
  console.log('Debug server on http://localhost:3001/debug-env');
});