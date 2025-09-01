import { MCPServer } from './mcp-server.js';
import { ConsoleApp } from './console-app.js';

async function main() {
  const args = process.argv.slice(2);
  const isConsoleMode = args.includes('--console') || args.includes('-c');

  if (isConsoleMode) {
    const consoleApp = new ConsoleApp();
    
    process.on('SIGINT', async () => {
      console.error('\nShutting down...');
      await consoleApp.stop();
    });

    process.on('SIGTERM', async () => {
      console.error('\nShutting down...');
      await consoleApp.stop();
    });

    try {
      await consoleApp.start();
    } catch (error) {
      console.error('Failed to start console app:', error);
      process.exit(1);
    }
  } else {
    const server = new MCPServer();
    
    process.on('SIGINT', async () => {
      console.error('Shutting down...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('Shutting down...');
      await server.stop();
      process.exit(0);
    });

    try {
      await server.start();
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});