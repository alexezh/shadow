import { YNode } from '../om/YNode.js';
import { paraProp, YPara } from '../om/YPara.js';
import { YBody } from '../om/YBody.js';
import { YTable } from '../om/YTable.js';
import { YRow } from '../om/YRow.js';
import { YCell } from '../om/YCell.js';
import { HtmlWriter } from './HtmlWriter.js';
import { YPropSet } from '../om/YPropSet.js';
import { CommentThreadRef } from '../server/messages.js';
import { YDocPart } from '../om/YDoc.js';

/**
 * Convert CSS property set to inline style string
 */
function propSetToStyle(props: YPropSet): string {

  const styles: string[] = [];
  for (const [key, value] of props.entries()) {
    if (!key.startsWith("!")) {
      styles.push(`${key}:${value}`);
    }
  }

  return styles.join(';');
}

/**
 * Make HTML for a paragraph node
 */
function makeParaHtml(node: YPara, writer: HtmlWriter): void {
  writer.writeOpenTag('p', { id: node.id });

  const str = node as YPara;
  const text = str.getText();
  const textAttrs = str.getTextAttrs();

  // Group consecutive characters with the same property ID
  let currentAttr = textAttrs[0];
  let currentText = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charAttr = textAttrs[i];

    // Check if this is a special marker character
    const isNewline = char === '\n';
    const isMarker = char === '\uFFFC'; // Object replacement character

    if (isNewline || isMarker) {
      // Flush current span if any
      if (currentText.length > 0) {
        const style = propSetToStyle(currentAttr);
        if (style) {
          writer.writeOpenTag('span', { style });
          writer.writeText(currentText);
          writer.writeCloseTag('span');
        } else {
          writer.writeText(currentText);
        }
        currentText = '';
      }

      // Write collapsed span with data-marker attribute
      if (isNewline) {
        writer.writeOpenTag('span', {
          'data-marker': 'eos',
          style: 'display:inline-block;width:0;height:0;overflow:hidden;'
        });
        writer.writeText('\n');
        writer.writeCloseTag('span');
      } else if (isMarker) {
        writer.writeOpenTag('span', {
          'data-marker': 'object',
          style: 'display:inline-block;width:0;height:0;overflow:hidden;'
        });
        writer.writeText('\uFFFC');
        writer.writeCloseTag('span');
      }

      currentAttr = charAttr;
    } else if (charAttr === currentAttr) {
      // Same property, accumulate
      currentText += char;
    } else {
      // Property changed, flush previous span
      if (currentText.length > 0) {
        const style = propSetToStyle(currentAttr);
        if (style) {
          writer.writeOpenTag('span', { style });
          writer.writeText(currentText);
          writer.writeCloseTag('span');
        } else {
          writer.writeText(currentText);
        }
      }
      // Start new span
      currentAttr = charAttr;
      currentText = char;
    }
  }

  // Flush remaining text
  if (currentText.length > 0) {
    const style = propSetToStyle(currentAttr);
    if (style) {
      writer.writeOpenTag('span', { style });
      writer.writeText(currentText);
      writer.writeCloseTag('span');
    } else {
      writer.writeText(currentText);
    }
  }

  writer.writeCloseTag('p');
}

/**
 * Make HTML for a node recursively
 */
export function makeHtml(node: YNode): string {
  const writer = new HtmlWriter();
  makeHtmlRecursive(node, writer);
  return writer.toString();
}

export function makeCommentThreadHtml(docPart: YDocPart): CommentThreadRef[] {
  const refs: CommentThreadRef[] = [];
  for (let t of docPart.threads) {
    let para = docPart.getParaByThread(t)
    let tr: CommentThreadRef = { threadId: t.id, paraId: para!.id, comments: [] }
    for (let c of t.comments) {
      tr.comments.push(c.id);
    }
    refs.push(tr);
  }
  return refs;
}

/**
 * Make HTML recursively
 */
function makeHtmlRecursive(node: YNode, writer: HtmlWriter): void {
  if (node instanceof YPara) {
    makeParaHtml(node, writer);
  } else if (node instanceof YBody) {
    writer.writeOpenTag('div', { id: node.id });
    for (const child of node.getChildren()) {
      makeHtmlRecursive(child, writer);
    }
    writer.writeCloseTag('div');
  } else if (node instanceof YTable) {
    writer.writeOpenTag('table', { id: node.id });
    for (const child of node.getChildren()) {
      makeHtmlRecursive(child, writer);
    }
    writer.writeCloseTag('table');
  } else if (node instanceof YRow) {
    writer.writeOpenTag('tr', { id: node.id });
    for (const child of node.getChildren()) {
      makeHtmlRecursive(child, writer);
    }
    writer.writeCloseTag('tr');
  } else if (node instanceof YCell) {
    writer.writeOpenTag('td', { id: node.id });
    for (const child of node.getChildren()) {
      makeHtmlRecursive(child, writer);
    }
    writer.writeCloseTag('td');
  }
}
