import { ActionResult, ChangeRecord, Session } from './session.js';
import { make31BitId } from '../make31bitid.js';
import { WRange } from '../om/YNode.js';
import { YPara } from '../om/YPara.js';
import { YStr } from '../om/YStr.js';
import { makeHtml } from '../om/makeHtml.js';
import { YBody } from '../om/YBody.js';
import { handlePaste } from './handlePaste.js';

export type RunActionRequest = {
  sessionId: string;
  action: string;
  range: WRange;
  text?: string; // For type action
  content?: string; // For paste action
}

export function handleRunAction(session: Session, req: RunActionRequest): ActionResult {
  const doc = session.doc;
  const body = doc.getBody();
  const propStore = doc.getPropStore();

  switch (req.action) {
    case 'backspace':
      return handleBackspace(doc, req.range);

    case 'delete':
      return handleDelete(doc, req.range);

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

function handleBackspace(doc: any, range: WRange): ActionResult {
  const body = doc.getBody();
  const propStore = doc.getPropStore();
  const node = doc.getNodeById(range.startElement);

  if (!node || !(node instanceof YPara)) {
    return { changes: [] };
  }

  const str = node as YPara;
  const offset = range.startOffset;

  // Check if there's a selection (range spans multiple characters)
  if (range.startElement === range.endElement && range.startOffset !== range.endOffset) {
    // Delete the selected range
    const start = Math.min(range.startOffset, range.endOffset);
    const end = Math.max(range.startOffset, range.endOffset);

    str.deleteRange(start, end);

    // Regenerate HTML
    const html = makeHtml(node, propStore);

    return {
      changes: [
        { id: node.id, html }
      ],
      newPosition: { element: node.id, offset: start }
    };
  }

  // If at start of paragraph, merge with previous
  if (offset === 0) {
    const children = body.getChildren();
    const nodeIndex = children.indexOf(node);

    if (nodeIndex > 0) {
      const prevNode = children[nodeIndex - 1];

      if (prevNode instanceof YPara) {
        const prevStr = prevNode as YPara;
        const prevLength = prevStr.length;

        // Append current paragraph's text to previous
        prevStr.append(str.getText(), 0);

        // Copy property IDs
        for (let i = 0; i < str.getLength(); i++) {
          prevStr.setPropIdAt(prevLength + i, str.getPropIdAt(i));
        }

        // Remove current paragraph
        body.removeChild(nodeIndex);

        // Regenerate HTML for merged paragraph
        const prevHtml = makeHtml(prevNode, propStore);

        return {
          changes: [
            { id: prevNode.id, html: prevHtml }
          ],
          newPosition: { element: prevNode.id, offset: prevLength }
        };
      }
    }

    return { changes: [] };
  }

  // Delete character before cursor
  str.delete(offset - 1, offset);

  // Regenerate HTML
  const html = makeHtml(node, propStore);

  return {
    changes: [
      { id: node.id, html }
    ],
    newPosition: { element: node.id, offset: offset - 1 }
  };
}

function handleDelete(doc: any, range: WRange): ActionResult {
  const body = doc.getBody();
  const propStore = doc.getPropStore();
  const node = doc.getNodeById(range.startElement);

  if (!node || !(node instanceof YPara)) {
    return { changes: [] };
  }

  const str = node.getStr();
  const offset = range.startOffset;

  // Check if there's a selection (range spans multiple characters)
  if (range.startElement === range.endElement && range.startOffset !== range.endOffset) {
    // Delete the selected range
    const start = Math.min(range.startOffset, range.endOffset);
    const end = Math.max(range.startOffset, range.endOffset);

    str.delete(start, end);

    // Regenerate HTML
    const html = makeHtml(node, propStore);

    return {
      changes: [
        { id: node.id, html }
      ],
      newPosition: { element: node.id, offset: start }
    };
  }

  // If at end of paragraph, merge with next
  if (offset >= str.getLength()) {
    const children = body.getChildren();
    const nodeIndex = children.indexOf(node);

    if (nodeIndex < children.length - 1) {
      const nextNode = children[nodeIndex + 1];

      if (nextNode instanceof YPara) {
        const nextStr = nextNode.getStr();
        const currentLength = str.getLength();

        // Append next paragraph's text to current
        str.append(nextStr.getText(), 0);

        // Copy property IDs
        for (let i = 0; i < nextStr.getLength(); i++) {
          str.setPropIdAt(currentLength + i, nextStr.getPropIdAt(i));
        }

        // Remove next paragraph
        body.removeChild(nodeIndex + 1);

        // Regenerate HTML for merged paragraph
        const html = makeHtml(node, propStore);

        return {
          changes: [
            { id: node.id, html }
          ],
          newPosition: { element: node.id, offset }
        };
      }
    }

    return { changes: [] };
  }

  // Delete character at cursor
  str.delete(offset, offset + 1);

  // Regenerate HTML
  const html = makeHtml(node, propStore);

  return {
    changes: [
      { id: node.id, html }
    ],
    newPosition: { element: node.id, offset }
  };
}

function handleType(doc: any, range: WRange, text: string): ActionResult {
  const propStore = doc.getPropStore();
  const node = doc.getNodeById(range.startElement);

  if (!node || !(node instanceof YPara)) {
    return { changes: [] };
  }

  const str = node.getStr();
  const offset = range.startOffset;

  // Insert text at cursor position
  // TODO: Get current property ID at cursor position for formatting
  str.insert(offset, text, 0);

  // Regenerate HTML
  const html = makeHtml(node, propStore);

  return {
    changes: [
      { id: node.id, html }
    ],
    newPosition: { element: node.id, offset: offset + text.length }
  };
}

function handleSplit(doc: any, range: WRange): ActionResult {
  const body = doc.getBody();
  const propStore = doc.getPropStore();
  const node = doc.getNodeById(range.startElement);

  if (!node || !(node instanceof YPara)) {
    return { changes: [] };
  }

  const offset = Math.max(0, Math.min(range.startOffset, node.str.length));
  const newNode = node.splitParagraph(offset);
  const children = body.getChildren();

  node.parent?.insertAfter(node, newNode);

  // Regenerate HTML for both paragraphs
  const firstHtml = makeHtml(node, propStore);
  const secondHtml = makeHtml(newNode, propStore);

  return {
    changes: [
      { id: node.id, html: firstHtml },
      { id: newNode.id, html: secondHtml, prevId: node.id }
    ],
    newPosition: { element: newNode.id, offset: 0 }
  };
}
