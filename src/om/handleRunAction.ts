import { ActionResult, ContentChangeRecord, Session } from '../clippy/session.js';
import { make31BitId } from '../make31bitid.js';
import { YRange } from './YNode.js';
import { YPara } from './YPara.js';
import { YStr } from './YStr.js';
import { makeHtml } from './makeHtml.js';
import { YBody } from './YBody.js';
import { handlePaste } from '../clippy/handlePaste.js';
import { deleteRange } from './deleteRange.js';
import { YDoc } from './YDoc.js';
import { YPropSet } from './YPropSet.js';

export type RunActionRequest = {
  sessionId: string;
  action: string;
  range: YRange;
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
      return formatRange(doc, req.range, (props: { [key: string]: any }) => {
        const c = props["font-weight"];
        if (!c || c === "normal") {
          props["font-weight"] = "bold";
        } else {
          delete props["font-weight"];
        }
      });

    case 'italic':
      return formatRange(doc, req.range, (props: { [key: string]: any }) => {
        const c = props["font-style"];
        if (!c || c === "normal") {
          props["font-style"] = "italic";
        } else {
          delete props["font-style"];
        }
      });

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

function formatRange(doc: YDoc, range: YRange, func: (props: { [key: string]: any }) => void): ActionResult {
  let items = [...doc.getBody().getChildrenRange(range)];

  const changeRecords: ContentChangeRecord[] = [];
  if (items.length > 1) {
    //items[0].applyFormat(range.startOffset, -1, func);
  } else {
    const item = items[0];
    if (item instanceof YPara) {
      item.applyFormat(range.startOffset, range.endOffset - range.startOffset, func);

      const html = makeHtml(item);
      changeRecords.push({
        id: item.id,
        html: html,
        op: "changed"
      })
    }
  }

  return {
    changes: changeRecords,
    newPosition: { element: range.startElement, offset: range.startOffset }
  };
}

function handleDelete(doc: YDoc, range: YRange, key: "backspace" | "delete"): ActionResult {
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
      });
    }
  }

  return {
    changes: changeRecords,
    newPosition: { element: node!.id, offset: range.startOffset ? range.startOffset - 1 : 0 }
  };
}

function handleType(doc: YDoc, range: YRange, text: string): ActionResult {
  const node = doc.getNodeById(range.startElement);

  if (!node || !(node instanceof YPara)) {
    return { changes: [] };
  }

  const para = node as YPara;
  const offset = range.startOffset;
  const prop = (offset === 0) ? para.getAttrAt(1) : para.getAttrAt(offset - 1);

  // Insert text at cursor position
  // TODO: Get current property ID at cursor position for formatting
  para.insertTextAt(offset, text, prop);

  // Regenerate HTML
  const html = makeHtml(node);

  return {
    changes: [
      { id: node.id, html, op: "changed" }
    ],
    newPosition: { element: node.id, offset: offset + text.length }
  };
}

function handleSplit(doc: YDoc, range: YRange): ActionResult {
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
