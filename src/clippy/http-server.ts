import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Database } from '../database.js';
import { YDoc } from '../om/YDoc.js';
import { executeCommand } from '../executecommand.js';
import { OpenAIClient } from '../openai-client.js';
import { handleRunAction, RunActionRequest } from './handleRunAction.js';
import { Session } from './session.js';

export class HttpServer {
  private server: http.Server | null = null;
  private database: Database;
  private port: number;
  private sessions: Map<string, Session>;
  private openaiClient: OpenAIClient;

  constructor(database: Database, port: number = 3000) {
    this.database = database;
    this.openaiClient = new OpenAIClient(database);
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
    if (url === '/' || url === '/clippy.html') {
      await this.serveFile(res, 'clippy.html', 'text/html');
      return;
    }

    // Serve wx.js
    if (url === '/clippy.js') {
      await this.serveFile(res, 'clippy.js', 'application/javascript');
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
      await this.handleGetDoc(req, res);
      return;
    }

    // API endpoint to run command
    if (url === '/api/runaction' && req.method === 'POST') {
      await this.handleRunAction(req, res);
      return;
    }

    // API endpoint to execute command (from Clippy)
    if (url === '/api/executecommand' && req.method === 'POST') {
      await this.handleExecuteCommand(req, res);
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

  private getOrCreateSession(sessionId?: string): Session {
    // If sessionId provided, try to get existing session
    if (sessionId) {
      const existing = this.sessions.get(sessionId);
      if (existing) {
        console.log(`Using existing session: ${sessionId}`);
        return existing;
      }
    }

    // Create new session
    const newSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const doc = new YDoc();

    // Create default document with placeholder paragraph
    const body = doc.getBody();
    const para = new (require('../om/YPara.js').YPara)(
      'p1',
      new (require('../om/YStr.js').YStr)('Document content will appear here. Click to position cursor.\n')
    );
    body.addChild(para);

    const session: Session = {
      id: newSessionId,
      createdAt: new Date(),
      pendingChanges: [],
      changeResolvers: [],
      doc
    };
    this.sessions.set(newSessionId, session);
    console.log(`Created session: ${newSessionId}`);
    return session;
  }

  private async handleGetDoc(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      // Get sessionId from XSessionId header
      const headerSessionId = req.headers['xsessionid'] as string | undefined;

      // Get or create session
      const session = this.getOrCreateSession(headerSessionId);

      // Generate HTML from document
      const makeHtml = require('../om/makeHtml.js').makeHtml;
      const html = makeHtml(session.doc.getBody(), session.doc.getPropStore());

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessionId: session.id, html }));
    } catch (error) {
      console.error('Error handling getdoc:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  private async handleRunAction(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const request = JSON.parse(body) as RunActionRequest;

        const session = this.sessions.get(request.sessionId);
        if (!session) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }

        // Execute action and get result
        const result = handleRunAction(session, request);

        // Add result to pending changes
        session.pendingChanges.push(result);

        // Notify any waiting getchanges requests
        this.notifyChangeListeners(request.sessionId);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result }));
      } catch (error) {
        console.error('Error handling runaction:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
  }

  private async handleExecuteCommand(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { sessionId, prompt } = JSON.parse(body);

        const session = this.sessions.get(sessionId);
        if (!session) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }

        console.log(`Execute command: session=${sessionId}, prompt="${prompt}"`);

        // Execute the command
        const result = await this.executeCommand(session, prompt);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result }));
      } catch (error) {
        console.error('Error handling executecommand:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
  }

  private async executeCommand(session: Session, prompt: string): Promise<string> {
    executeCommand(session, this.database, this.openaiClient, prompt);
    // Notify waiting clients
    this.notifyChangeListeners(session.id);
    return "success";
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
