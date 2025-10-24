import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Database } from './database.js';

export class HttpServer {
  private server: http.Server | null = null;
  private database: Database;
  private port: number;

  constructor(database: Database, port: number = 3000) {
    this.database = database;
    this.port = port;
  }

  async start(): Promise<void> {
    this.server = http.createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (error) {
        console.error('Request error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.port, () => {
        console.log(`HTTP server listening on http://localhost:${this.port}`);
        resolve();
      });

      this.server!.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve, reject) => {
        this.server!.close((err) => {
          if (err) {
            reject(err);
          } else {
            console.log('HTTP server stopped');
            resolve();
          }
        });
      });
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url || '/';

    // Serve w.html at root
    if (url === '/' || url === '/w.html') {
      await this.serveFile(res, 'w.html', 'text/html');
      return;
    }

    // API endpoint to get document
    if (url === '/api/getdoc' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<div id="placeholder">Document content will appear here</div>');
      return;
    }

    // 404 for other routes
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private async serveFile(res: http.ServerResponse, filename: string, contentType: string): Promise<void> {
    try {
      const filePath = path.join(process.cwd(), 'public', filename);
      const content = await fs.readFile(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
    }
  }
}
