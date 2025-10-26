import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Database } from '../database.js';
import { YDoc } from '../om/YDoc.js';
import { executePrompt } from '../executeprompt.js';
import { OpenAIClient } from '../openai-client.js';
import { handleRunAction, RunActionRequest } from './handleRunAction.js';
import { PromptRequest, Session } from './session.js';
import { makeDefaultDoc } from './loaddoc.js';
import { makeHtml } from '../om/makeHtml.js';
import { SessionImpl } from './sessionimpl.js';

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

    console.log(url);
    // Serve w.html at root
    if (url === '/' || url === '/clippy.html') {
      await this.serveFile(res, 'clippy.html', 'text/html');
      return;
    }

    // Serve wx.js
    switch (url) {

      case '/clippy.js':
        await this.serveFile(res, 'dist/clippy.js', 'application/javascript');
        return;

      case '/dom.js':
        await this.serveFile(res, 'dist/dom.js', 'application/javascript');
        return;

      case '/ip.js':
        await this.serveFile(res, 'dist/ip.js', 'application/javascript');
        return;

      // Serve image files
      case '/bullet.png':
        await this.serveFile(res, 'bullet.png', 'image/png');
        return;


      case '/numbered.png':
        await this.serveFile(res, 'numbered.png', 'image/png');
        return;


      case '/clippy.png':
        await this.serveFile(res, 'clippy.png', 'image/png');
        return;


      case '/uparrow.png':
        await this.serveFile(res, 'uparrow.png', 'image/png');
        return;


      // API endpoint to get document
      case '/api/getdoc':
        if (req.method === 'GET') {
          await this.handleGetDoc(req, res);
          return;
        }

      // API endpoint to run command
      case '/api/runaction':
        if (req.method === 'POST') {
          await this.handleRunAction(req, res);
          return;
        }
      // API endpoint to create part
      case '/api/createpart':
        if (req.method === 'POST') {
          await this.handleCreatePart(req, res);
          return;
        }

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

    // API endpoint to get parts list
    if (url.startsWith('/api/getparts') && req.method === 'GET') {
      await this.handleGetParts(req, res);
      return;
    }

    // API endpoint to get part
    if (url.startsWith('/api/getpart') && req.method === 'GET') {
      await this.handleGetPart(req, res);
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
    const doc = makeDefaultDoc();

    const session = new SessionImpl(newSessionId, doc, 'main');
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
      const html = makeHtml(session.doc.getBody());

      // Get styles as JSON array
      const styles = session.doc.getStyleStore().toJson();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessionId: session.id, html, styles }));
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
        //session.pendingChanges.push(result);

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
        const request = JSON.parse(body) as PromptRequest;

        const session = this.sessions.get(request.sessionId);
        if (!session) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }

        console.log(`Execute command: session=${request.sessionId}, prompt="${request.prompt}"`);

        // Execute the command
        const result = await this.executeCommand(session, request);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result }));
      } catch (error) {
        console.error('Error handling executecommand:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
  }

  private async executeCommand(session: Session, prompt: PromptRequest): Promise<string> {
    executePrompt(session, this.database, this.openaiClient, prompt.prompt, {
      partId: prompt.partId,
      docId: prompt.docId,
      selectionRange: prompt.selectionRange
    });
    // Notify waiting clients
    //this.notifyChangeListeners(session.id);
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

  private async handleGetParts(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
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

    // Get all parts from the document
    const parts = Array.from(session.doc.parts.values()).map(part => ({
      id: part.id,
      kind: part.kind,
      title: part.title
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ parts }));
  }

  private async handleCreatePart(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const { sessionId, kind } = JSON.parse(body);

        const session = this.sessions.get(sessionId);
        if (!session) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }

        // Create a new part
        const partId = session.doc.createPart(kind);
        console.log(`Created part: ${partId} (kind: ${kind})`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, partId }));
      } catch (error) {
        console.error('Error handling createpart:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
  }

  private async handleGetPart(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');
    const partId = url.searchParams.get('partId');

    if (!sessionId || !partId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing sessionId or partId' }));
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }

    // Get the part
    const part = session.doc.parts.get(partId);
    if (!part) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Part not found' }));
      return;
    }

    // Update session's current part
    session.currentPartId = partId;

    // Generate HTML from part's body
    const html = part.body ? makeHtml(part.body) : '';

    // Get styles as JSON array
    const styles = session.doc.getStyleStore().toJson();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ html, styles }));
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
