import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Database } from './database.js';

interface Session {
  id: string;
  createdAt: Date;
  pendingChanges: Array<{ id: string; html: string }>;
  changeResolvers: Array<(changes: any[]) => void>;
}

export class HttpServer {
  private server: http.Server | null = null;
  private database: Database;
  private port: number;
  private sessions: Map<string, Session>;

  constructor(database: Database, port: number = 3000) {
    this.database = database;
    this.port = port;
    this.sessions = new Map();
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

    // Serve wx.js
    if (url === '/wx.js') {
      await this.serveFile(res, 'wx.js', 'application/javascript');
      return;
    }

    // Serve image files
    if (url === '/bullet.png') {
      await this.serveFile(res, 'bullet.png', 'image/png');
      return;
    }

    if (url === '/numbered.png') {
      await this.serveFile(res, 'numbered.png', 'image/png');
      return;
    }

    if (url === '/clippy.png') {
      await this.serveFile(res, 'clippy.png', 'image/png');
      return;
    }

    if (url === '/uparrow.png') {
      await this.serveFile(res, 'uparrow.png', 'image/png');
      return;
    }

    // API endpoint to get document
    if (url === '/api/getdoc' && req.method === 'GET') {
      const sessionId = this.createSession();
      const html = '<div id="placeholder">Document content will appear here. Click to position cursor.</div>';

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessionId, html }));
      return;
    }

    // API endpoint to run command
    if (url === '/api/runcommand' && req.method === 'POST') {
      await this.handleRunCommand(req, res);
      return;
    }

    // API endpoint to get changes (long polling)
    if (url.startsWith('/api/getchanges') && req.method === 'GET') {
      await this.handleGetChanges(req, res);
      return;
    }

    // 404 for other routes
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private createSession(): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session: Session = {
      id: sessionId,
      createdAt: new Date(),
      pendingChanges: [],
      changeResolvers: []
    };
    this.sessions.set(sessionId, session);
    console.log(`Created session: ${sessionId}`);
    return sessionId;
  }

  private async handleRunCommand(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const { sessionId, action, range } = JSON.parse(body);

        const session = this.sessions.get(sessionId);
        if (!session) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }

        console.log(`Command: ${action}, session: ${sessionId}, range:`, range);

        // Process command and generate changes
        // For now, just acknowledge the command
        // In a real implementation, this would:
        // 1. Find the element by range.startElement
        // 2. Apply the formatting (bold, italic, etc.) or split paragraph
        // 3. Generate new HTML
        // 4. Queue the change for this session

        let changes = [];

        if (action === 'split') {
          // Split paragraph at cursor position
          // For now, create two paragraphs
          const newId = `p_${Date.now()}`;
          changes = [
            {
              id: range.startElement,
              html: `<p id="${range.startElement}">First part</p>`
            },
            {
              id: newId,
              html: `<p id="${newId}">Second part</p>`
            }
          ];
        } else {
          // Other formatting commands
          changes = [
            {
              id: range.startElement,
              html: `<p id="${range.startElement}">Modified content (${action})</p>`
            }
          ];
        }

        // Queue changes for this session
        session.pendingChanges.push(...changes);

        // Notify any waiting getchanges requests
        this.notifyChangeListeners(sessionId);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        console.error('Error handling runcommand:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
  }

  private async handleGetChanges(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing sessionId' }));
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }

    // If there are pending changes, return them immediately
    if (session.pendingChanges.length > 0) {
      const changes = session.pendingChanges.splice(0);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(changes));
      return;
    }

    // Otherwise, wait for changes (long polling)
    const changePromise = new Promise<any[]>((resolve) => {
      session.changeResolvers.push(resolve);
    });

    // Set timeout to prevent indefinite hanging (60 seconds)
    const timeout = setTimeout(() => {
      const index = session.changeResolvers.indexOf(changePromise as any);
      if (index > -1) {
        session.changeResolvers.splice(index, 1);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
    }, 60000);

    const changes = await changePromise;
    clearTimeout(timeout);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(changes));
  }

  private notifyChangeListeners(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.pendingChanges.length === 0) {
      return;
    }

    // Resolve all waiting requests with the pending changes
    while (session.changeResolvers.length > 0) {
      const resolve = session.changeResolvers.shift();
      if (resolve) {
        const changes = session.pendingChanges.splice(0);
        resolve(changes);
      }
    }
  }

  private async serveFile(res: http.ServerResponse, filename: string, contentType: string): Promise<void> {
    try {
      const filePath = path.join(process.cwd(), 'public', filename);
      // Read as binary if it's an image
      const isBinary = contentType.startsWith('image/');
      const content = await fs.readFile(filePath, isBinary ? undefined : 'utf-8');
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
    }
  }
}
