import { GetChatResponse, CreateChatResponse } from "./messages.js";
import type { Session } from "./session.js";
import * as http from 'http';
import { makeHtml } from "../om/makeHtml.js";
import { YChat, YChatMessage } from "../om/YChat.js";
import { YBody } from "../om/YBody.js";
import { YPara } from "../om/YPara.js";
import { YStr } from "../om/YStr.js";
import { YPropSet } from "../om/YPropSet.js";
import { make31BitId } from "../om/make31bitid.js";

/**
 * Handle GET /api/getchat
 * Returns chat messages for a specific chat
 */
export async function handleGetChat(
  sessions: ReadonlyMap<string, Session>,
  req: http.IncomingMessage,
  res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');
  const chatId = url.searchParams.get('chatId');

  if (!sessionId || !chatId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing sessionId or chatId' }));
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  // Get the chat part
  const chatPart = session.doc.parts.get(chatId);
  if (!chatPart || chatPart.kind !== 'chat') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Chat not found' }));
    return;
  }

  // Get YChat from part's body
  // Each chat message is a paragraph in the body
  const messages: GetChatResponse['messages'] = [];

  if (chatPart.body) {
    const children = chatPart.body.getChildren();
    for (const child of children) {
      if (child instanceof YPara) {
        // Extract role from paragraph props (stored in --data-role)
        const role = child.props.get('--data-role') as 'user' | 'assistant' | 'system' || 'user';
        const html = makeHtml(child);
        messages.push({
          messageId: child.id,
          role: role,
          html: html
        });
      }
    }
  }

  const response: GetChatResponse = {
    chatId: chatId,
    messages: messages
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

/**
 * Handle POST /api/createchat
 * Creates a new chat part in the document
 */
export async function handleCreateChat(
  sessions: ReadonlyMap<string, Session>,
  req: http.IncomingMessage,
  res: http.ServerResponse): Promise<void> {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const { sessionId, docId } = JSON.parse(body);

      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing sessionId' }));
        return;
      }

      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }

      // Create a new chat part
      const chatPart = session.doc.createPart('chat');

      // Add initial welcome message
      const welcomeText = new YStr();
      welcomeText.append('Chat created. Ask me anything!', YPropSet.create({}));
      const welcomePara = new YPara(make31BitId(), YPropSet.create({ '--data-role': 'system' }), welcomeText);
      chatPart.body!.addChild(welcomePara);

      console.log(`Created chat: ${chatPart.id}`);

      const response: CreateChatResponse = {
        chatId: chatPart.id
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (error) {
      console.error('Error handling createchat:', error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request' }));
    }
  });
}
