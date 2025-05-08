#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Path to our fake npx
const fakenpx = path.resolve(__dirname, '../bin/npx');

// Environment variables
const env = {
  ...process.env,
  MCP_PROXY_URL: 'http://localhost:9876',
  MCP_DEBUG: 'true'
};

// Mock an initialize request
const initRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-01-01",
    capabilities: {},
    clientInfo: {
      name: "Test Client",
      version: "1.0.0"
    }
  }
};

// Spawn the fake npx with filesystem server args
const npxProcess = spawn(fakenpx, [
  "-y",
  "@modelcontextprotocol/server-filesystem",
  "/tmp"
], {
  env: env
});

// Log stdout and stderr
npxProcess.stdout.on('data', (data) => {
  console.log(`STDOUT: ${data.toString().trim()}`);
});

npxProcess.stderr.on('data', (data) => {
  console.error(`STDERR: ${data.toString().trim()}`);
});

// Send test request
npxProcess.stdin.write(JSON.stringify(initRequest) + '\n');

// Handle exit
npxProcess.on('close', (code) => {
  console.log(`Child process exited with code ${code}`);
});

// Set timeout to kill the process after 5 seconds
setTimeout(() => {
  npxProcess.kill();
  console.log('Test completed');
}, 5000);
