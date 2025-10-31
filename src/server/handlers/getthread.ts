import { GetThreadResponse } from "../messages.js";
import type { Session } from "../session.js";
import * as http from 'http';

export async function handleGetThread(
  sessions: ReadonlyMap<string, Session>,
  req: http.IncomingMessage,
  res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');
  const partId = url.searchParams.get('partId');
  const threadId = url.searchParams.get('threadId');

  if (!sessionId || !partId || !threadId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing sessionId, partId, or threadId' }));
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  // TODO: Implement actual thread storage in YDoc
  // For now, return mock data
  const response: GetThreadResponse = {
    threadId: threadId,
    paraId: session.doc.getBody().getChildren()[0].id,
    resolved: false,
    comments: [
      {
        commentId: `${threadId}-comment-1`,
        author: 'User',
        html: '<p>This is a sample comment</p>',
        timestamp: new Date(Date.now() - 3600000).toISOString()
      },
      {
        commentId: `${threadId}-comment-2`,
        author: 'Assistant',
        html: '<p>This is a response to the comment</p>',
        timestamp: new Date(Date.now() - 1800000).toISOString()
      }
    ]
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}
