import { ActionResult, ContentChangeRecord, Session } from './session.js';
import { make31BitId } from '../make31bitid.js';
import { WRange } from '../om/YNode.js';
import { YPara } from '../om/YPara.js';
import { YStr } from '../om/YStr.js';
import { makeHtml } from '../om/makeHtml.js';
import { YBody } from '../om/YBody.js';
import { handlePaste } from './handlePaste.js';
import { deleteRange } from '../om/deleteRange.js';
import { YDoc } from '../om/YDoc.js';
import { YPropSet } from '../om/YPropSet.js';

export type RunActionRequest = {
  sessionId: string;
  action: string;
  range: WRange;
  text?: string; // For type action
  content?: string; // For paste action
  partId?: string; // Optional part ID, defaults to 'main'
}

export function handleRunAction(session: Session, req: RunActionRequest): ActionResult {
  const doc = session.doc;

  // Update current part ID if provided
  if (req.partId) {
    session.currentPartId = req.partId;
  }

  switch (req.action) {
    case 'backspace':
      return handleDelete(doc, req.range, "backspace");

    case 'bold':
      return handleDelete(doc, req.range, "backspace");

    case 'italic':
      return handleDelete(doc, req.range, "backspace");

    case 'delete':
      return handleDelete(doc, req.range, "delete");

    case 'type':
      return handleType(doc, req.range, req.text || '');

    case 'split':
      return handleSplit(doc, req.range);

    case 'paste':
      return handlePaste(doc, req.range, req.content || '');

    default:
      // Other formatting commands - placeholder
      return {
        changes: [],
        newPosition: { element: req.range.startElement, offset: req.range.startOffset }
      };
  }
}

function formatRange(doc: YDoc, range: WRange, func: () => YPropSet): ActionResult {
  let items = [...doc.getBody().getChildrenRange(range)];
  
  return {
    changes: [],
    newPosition: { element: range.startElement, offset: range.startOffset }
  };
}

function handleDelete(doc: YDoc, range: WRange, key: "backspace" | "delete"): ActionResult {
  const node = doc.getNodeById(range.startElement);
  let changedNodes = deleteRange(doc, range);

  const changeRecords: ContentChangeRecord[] = [];
  for (let c of changedNodes) {
    if (c.op === "deleted") {
      changeRecords.push({
        id: c.node.id,
        html: null,
        op: c.op
      })
    } else {
      const html = makeHtml(c.node);
      changeRecords.push({
        id: c.node.id,
        html: html,
        op: c.op
      })
    }

  }

  return {
    changes: changeRecords,
    newPosition: { element: node!.id, offset: range.startOffset ? range.startOffset - 1 : 0 }
  };
}

function handleType(doc: YDoc, range: WRange, text: string): ActionResult {
  const node = doc.getNodeById(range.startElement);

  if (!node || !(node instanceof YPara)) {
    return { changes: [] };
  }

  const str = node as YPara;
  const offset = range.startOffset;

  // Insert text at cursor position
  // TODO: Get current property ID at cursor position for formatting
  str.insertTextAt(offset, text, YPropSet.create({}));

  // Regenerate HTML
  const html = makeHtml(node);

  return {
    changes: [
      { id: node.id, html, op: "changed" }
    ],
    newPosition: { element: node.id, offset: offset + text.length }
  };
}

function handleSplit(doc: YDoc, range: WRange): ActionResult {
  const body = doc.getBody();
  const node = doc.getNodeById(range.startElement);

  if (!node || !(node instanceof YPara)) {
    return { changes: [] };
  }

  const offset = Math.max(0, Math.min(range.startOffset, node.length));
  const newNode = node.splitParagraph(offset);
  const children = body.getChildren();

  node.parent?.insertAfter(node, newNode);

  // Regenerate HTML for both paragraphs
  const firstHtml = makeHtml(node);
  const secondHtml = makeHtml(newNode);

  return {
    changes: [
      { id: node.id, html: firstHtml, op: "changed" },
      { id: newNode.id, html: secondHtml, prevId: node.id, op: "inserted" }
    ],
    newPosition: { element: newNode.id, offset: 0 }
  };
}
