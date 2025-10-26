import { ActionResult, ChangeRecord } from './session.js';
import { WRange, YNode, YTextContainer } from '../om/YNode.js';
import { YDoc } from '../om/YDoc.js';
import { YPara } from '../om/YPara.js';
import { YBody } from '../om/YBody.js';
import { makeHtml } from '../om/makeHtml.js';
import { loadHtml } from '../om/loadHtml.js';
import { make31BitId } from '../make31bitid.js';
import { YStr } from '../om/YStr.js';
import { YPropSet } from '../om/YPropSet.js';

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
  const node = doc.getNodeById(range.startElement);

  if (!node || !(node instanceof YPara)) {
    return { changes: [] };
  }

  // Try to parse as HTML first, fall back to plain text
  let pastedNodes: YNode[] = [];
  let useText = false;
  try {
    // Attempt to parse as HTML (pass styleStore for CSS extraction)
    const styleStore = doc.getStyleStore();
    const parsed = loadHtml(content, styleStore);

    // Extract paragraphs from parsed content
    if (parsed instanceof YTextContainer) {
      pastedNodes = parsed.getChildren() as YNode[];
    } else if (parsed instanceof YPara) {
      pastedNodes = [parsed];
    }
  } catch (error) {
    // If HTML parsing fails, treat as plain text
    console.log('Paste: treating content as plain text');
    useText = true;
  }

  // If HTML parsing failed or yielded no paragraphs, treat as plain text
  if (useText) {
    // Split plain text by newlines to create multiple paragraphs
    const lines = content.split('\n');
    pastedNodes = lines.map(line => {
      const para = new YPara(make31BitId(), YPropSet.create({}), new YStr(line));
      return para;
    });
  }

  return pasteNodes(doc, range, pastedNodes)
}


function pasteNodes(doc: YDoc, range: WRange, content: YNode[]): ActionResult {
  const body = doc.getBody();
  const node = doc.getNodeById(range.startElement);

  if (!node || !(node instanceof YPara)) {
    return { changes: [] };
  }

  if (!node.parent) {
    console.log('pasteNodes: no parent');
    return { changes: [] };
  }

  // need to delete range first

  const offset = range.startOffset;

  // ideally, we should return segment object if we only get spans
  // for now, always assume full para
  // If pasting a single paragraph, insert inline
  // if (pastedNodes.length === 1) {
  //   const pastedText = pastedNodes[0].getStr().text;
  //   str.insert(offset, pastedText, 0);

  //   const pastedPropIds = pastedNodes[0].getStr().getPropIds();

  //   const html = makeHtml(node, propStore);

  //   return {
  //     changes: [
  //       { id: node.id, html }
  //     ],
  //     newPosition: { element: node.id, offset: offset + pastedText.length }
  //   };
  // }

  // Multiple paragraphs - split current paragraph and insert between
  const rightPara = node.splitParagraph(offset);
  node.parent!.insertAfter(node, rightPara)

  const changes: ChangeRecord[] = [
    { id: node.id, html: makeHtml(node), op: "changed" }
  ];

  // Insert middle pasted paragraphs (if any)
  let lastInsertedId = node.id;
  node.parent!.insertAfter(node, ...content);
  for (let add of content) {
    changes.push({
      id: add.id,
      html: makeHtml(add),
      op: "inserted",
      prevId: lastInsertedId
    });
    lastInsertedId = node.id;
  }

  changes.push({
    id: rightPara.id,
    html: makeHtml(rightPara),
    op: "inserted",
    prevId: lastInsertedId
  });

  return {
    changes,
    newPosition: { element: node.id, offset: node.length }
  };
}
