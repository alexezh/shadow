import * as http from 'http';
import { Session } from '../session.js';
import { YBody } from '../../om/YBody.js';
import { YStr } from '../../om/YStr.js';
import { YPara } from '../../om/YPara.js';
import { make31BitId } from '../../om/make31bitid.js';
import { YPropSet } from '../../om/YPropSet.js';
import { copyRange } from '../../om/copyRange.js';

export async function handleCreatePart(sessions: ReadonlyMap<string, Session>,
  res: http.ServerResponse, body: string): Promise<void> {
  try {
    const { sessionId, kind, selectionRange } = JSON.parse(body);

    const session = sessions.get(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }

    // Create a new part
    const part = session.doc.createPart(kind);

    // If there's a selection, copy it to the new part
    if (selectionRange && selectionRange.startElement) {
      try {
        const copiedBody = copyRange(session.doc, selectionRange);

        if (copiedBody && copiedBody.getChildren().length > 0) {
          // Create a new body with the correct ID and copy children
          const newBody = new YBody(`body_${part.id}`, copiedBody.props);
          for (const child of copiedBody.getChildren() || []) {
            newBody.addChild(child);
          }
          part.body = newBody;
          part.linkNodeInternal(null, part.body);
          console.log(`Created part with ${newBody.getChildren().length} nodes from selection`);
        }
      } catch (error) {
        console.error('Error copying selection to new part:', error);
        // Fall through to default content
      }
    }

    // If no selection or error, use default content
    if (!part.body || part.body.getChildren().length === 0) {
      const defaultText = kind === 'chat' ? 'Chat created. Ask me anything!\n' : 'Draft content will appear here. Click to position cursor.\n';
      const para = new YPara(make31BitId(), YPropSet.create({}),
        new YStr(defaultText, YPropSet.create({})));
      if (!part.body) {
        part.body = new YBody(`body_${part.id}`, YPropSet.create({}));
        part.linkNodeInternal(null, part.body);
      }
      part.body.addChild(para);
    }

    console.log(`Created part: ${part.id} (kind: ${kind})`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, partId: part.id }));
  } catch (error) {
    console.error('Error handling createpart:', error);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid request' }));
  }
}