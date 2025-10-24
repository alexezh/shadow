//import { MCPServer } from './mcp-server.js';
import { ConsoleApp } from './console-app.js';
import { Database } from './database.js';
import { HttpServer } from './http-server.js';

async function main() {
  const args = process.argv.slice(2);
  const isConsoleMode = args.includes('--console') || args.includes('-c');
  const isServerMode = args.includes('--server') || args.includes('-s');

  // Create shared database instance
  const database = new Database();
  await database.initialize();

  if (isServerMode) {
    // Run HTTP server
    const httpServer = new HttpServer(database, 3000);

    process.on('SIGINT', async () => {
      console.error('\nShutting down...');
      await httpServer.stop();
      await database.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('\nShutting down...');
      await httpServer.stop();
      await database.close();
      process.exit(0);
    });

    try {
      await httpServer.start();
    } catch (error) {
      console.error('Failed to start HTTP server:', error);
      process.exit(1);
    }
  } else if (isConsoleMode) {
    // Run both ConsoleApp and MCPServer in parallel
    const consoleApp = new ConsoleApp(database);
    //const server = new MCPServer(database);

    process.on('SIGINT', async () => {
      console.error('\nShutting down...');
      await consoleApp.stop();
      //await server.stop();
      await database.close();
    });

    process.on('SIGTERM', async () => {
      console.error('\nShutting down...');
      await consoleApp.stop();
      //await server.stop();
      await database.close();
    });

    try {
      // Start MCP server in background
      // server.start().catch(error => {
      //   console.error('MCP Server error:', error);
      // });

      // Start console app (blocks on user input)
      await consoleApp.start();
    } catch (error) {
      console.error('Failed to start console app:', error);
      process.exit(1);
    }
  } else {
    // const server = new MCPServer(database);

    // process.on('SIGINT', async () => {
    //   console.error('Shutting down...');
    //   await server.stop();
    //   await database.close();
    //   process.exit(0);
    // });

    // process.on('SIGTERM', async () => {
    //   console.error('Shutting down...');
    //   await server.stop();
    //   await database.close();
    //   process.exit(0);
    // });

    // try {
    //   await server.start();
    // } catch (error) {
    //   console.error('Failed to start server:', error);
    //   process.exit(1);
    // }
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});