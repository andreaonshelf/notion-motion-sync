const { spawn } = require('child_process');
const fs = require('fs');

console.log('Restarting notion-motion-sync server...');

// Kill existing processes
const killProcess = spawn('pkill', ['-f', 'node.*index.js'], { stdio: 'inherit' });

killProcess.on('close', (code) => {
  console.log('Existing processes killed (if any)');
  
  // Wait a moment then start new process
  setTimeout(() => {
    console.log('Starting new server...');
    
    // Start new server
    const server = spawn('npm', ['start'], {
      cwd: '/Users/andreavillani/notion-motion-sync',
      detached: true,
      stdio: 'inherit'
    });
    
    server.unref();
    
    console.log('Server restarted with PID:', server.pid);
    process.exit(0);
  }, 2000);
});