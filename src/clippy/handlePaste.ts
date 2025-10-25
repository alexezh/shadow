import { ActionResult } from './session.js';
import { WRange } from '../om/YNode.js';
import { YDoc } from '../om/YDoc.js';
import { YPara } from '../om/YPara.js';
import { YBody } from '../om/YBody.js';
import { makeHtml } from '../om/makeHtml.js';
import { loadHtml } from '../om/loadHtml.js';
import { make31BitId } from '../make31bitid.js';

/**
 * Handle paste action - insert HTML/text content at cursor position
 *
 * @param doc - The document to paste into
 * @param range - The cursor position where to paste
 * @param content - HTML or plain text content to paste
 * @returns ActionResult with updated HTML blocks
 */
export function handlePaste(doc: YDoc, range: WRange, content: string): ActionResult {
  const body = doc.getBody();
  const propStore = doc.getPropStore();
  const node = doc.getNodeById(range.startElement);

  if (!node || !(node instanceof YPara)) {
    return { changes: [] };
  }

  const children = body.getChildren() as YPara[];
  const nodeIndex = children.indexOf(node);

  if (nodeIndex === -1) {
    return { changes: [] };
  }

  // Try to parse as HTML first, fall back to plain text
  let pastedNodes: YPara[] = [];

  try {
    // Attempt to parse as HTML (pass styleStore for CSS extraction)
    const styleStore = doc.getStyleStore();
    const parsed = loadHtml(content, propStore, styleStore);

    // Extract paragraphs from parsed content
    if (parsed instanceof YBody) {
      const parsedChildren = parsed.getChildren() as YPara[];
      pastedNodes = parsedChildren.filter(child => child instanceof YPara);
    } else if (parsed instanceof YPara) {
      pastedNodes = [parsed];
    }
  } catch (error) {
    // If HTML parsing fails, treat as plain text
    console.log('Paste: treating content as plain text');
  }

  // If HTML parsing failed or yielded no paragraphs, treat as plain text
  if (pastedNodes.length === 0) {
    // Split plain text by newlines to create multiple paragraphs
    const lines = content.split('\n');
    pastedNodes = lines.map(line => {
      const para = new YPara(make31BitId(), undefined);
      const str = para.getStr();
      str.append(line, 0);
      return para;
    });
  }

  // Reset all IDs to random values to avoid conflicts
  for (const para of pastedNodes) {
    para.setId(make31BitId());
  }

  const str = node.getStr();
  const offset = range.startOffset;

  // If pasting a single paragraph, insert inline
  if (pastedNodes.length === 1) {
    const pastedText = pastedNodes[0].getStr().getText();
    str.insert(offset, pastedText, 0);

    // Copy property IDs from pasted content
    const pastedPropIds = pastedNodes[0].getStr().getPropIds();
    for (let i = 0; i < pastedText.length; i++) {
      str.setPropIdAt(offset + i, pastedPropIds[i] || 0);
    }

    const html = makeHtml(node, propStore);

    return {
      changes: [
        { id: node.getId(), html }
      ],
      newPosition: { element: node.getId(), offset: offset + pastedText.length }
    };
  }

  // Multiple paragraphs - split current paragraph and insert between
  const firstText = str.getText().substring(0, offset);
  const lastText = str.getText().substring(offset);

  // Update current paragraph with first part + first pasted paragraph
  const firstPastedText = pastedNodes[0].getStr().getText();
  str.delete(0, str.getLength());
  str.append(firstText, 0);
  str.append(firstPastedText, 0);

  // Copy property IDs for first pasted paragraph
  const firstPastedPropIds = pastedNodes[0].getStr().getPropIds();
  for (let i = 0; i < firstPastedText.length; i++) {
    str.setPropIdAt(firstText.length + i, firstPastedPropIds[i] || 0);
  }

  const changes: Array<{ id: string; html: string; prevId?: string }> = [
    { id: node.getId(), html: makeHtml(node, propStore) }
  ];

  // Insert middle pasted paragraphs (if any)
  let lastInsertedId = node.getId();
  for (let i = 1; i < pastedNodes.length - 1; i++) {
    const para = pastedNodes[i];
    body.insertChild(nodeIndex + i, para);
    changes.push({
      id: para.getId(),
      html: makeHtml(para, propStore),
      prevId: lastInsertedId
    });
    lastInsertedId = para.getId();
  }

  // Create last paragraph with last pasted paragraph + remaining text
  const lastPara = new YPara(make31BitId(), undefined);
  const lastStr = lastPara.getStr();
  const lastPastedText = pastedNodes[pastedNodes.length - 1].getStr().getText();
  lastStr.append(lastPastedText, 0);
  lastStr.append(lastText, 0);

  // Copy property IDs for last pasted paragraph
  const lastPastedPropIds = pastedNodes[pastedNodes.length - 1].getStr().getPropIds();
  for (let i = 0; i < lastPastedText.length; i++) {
    lastStr.setPropIdAt(i, lastPastedPropIds[i] || 0);
  }

  body.insertChild(nodeIndex + pastedNodes.length - 1, lastPara);
  changes.push({
    id: lastPara.getId(),
    html: makeHtml(lastPara, propStore),
    prevId: lastInsertedId
  });

  return {
    changes,
    newPosition: { element: lastPara.getId(), offset: lastPastedText.length }
  };
}
