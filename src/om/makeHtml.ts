import { YNode } from './YNode.js';
import { YPara } from './YPara.js';
import { YBody } from './YBody.js';
import { YTable } from './YTable.js';
import { YRow } from './YRow.js';
import { YCell } from './YCell.js';
import { YPropStore } from './YPropStore.js';
import { HtmlWriter } from './HtmlWriter.js';

/**
 * Convert CSS property set to inline style string
 */
function propSetToStyle(propStore: YPropStore, propId: number): string {
  if (propId === 0) {
    return '';
  }

  const propSet = propStore.get(propId);
  if (!propSet) {
    return '';
  }

  const styles: string[] = [];
  for (const [key, value] of propSet.entries()) {
    styles.push(`${key}:${value}`);
  }

  return styles.join(';');
}

/**
 * Make HTML for a paragraph node
 */
function makeParaHtml(node: YPara, propStore: YPropStore, writer: HtmlWriter): void {
  writer.writeOpenTag('p', { id: node.getId() });

  const str = node.getStr();
  const text = str.getText();
  const propIds = str.getPropIds();

  // Group consecutive characters with the same property ID
  let currentPropId = propIds[0] || 0;
  let currentText = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charPropId = propIds[i] || 0;

    if (char === '\n') {
      // Flush current span if any
      if (currentText.length > 0) {
        const style = propSetToStyle(propStore, currentPropId);
        if (style) {
          writer.writeOpenTag('span', { style });
          writer.writeText(currentText);
          writer.writeCloseTag('span');
        } else {
          writer.writeText(currentText);
        }
        currentText = '';
      }
      // Write newline as <br>
      writer.writeSelfClosingTag('br');
      currentPropId = charPropId;
    } else if (charPropId === currentPropId) {
      // Same property, accumulate
      currentText += char;
    } else {
      // Property changed, flush previous span
      if (currentText.length > 0) {
        const style = propSetToStyle(propStore, currentPropId);
        if (style) {
          writer.writeOpenTag('span', { style });
          writer.writeText(currentText);
          writer.writeCloseTag('span');
        } else {
          writer.writeText(currentText);
        }
      }
      // Start new span
      currentPropId = charPropId;
      currentText = char;
    }
  }

  // Flush remaining text
  if (currentText.length > 0) {
    const style = propSetToStyle(propStore, currentPropId);
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
export function makeHtml(node: YNode, propStore: YPropStore): string {
  const writer = new HtmlWriter();
  makeHtmlRecursive(node, propStore, writer);
  return writer.toString();
}

/**
 * Make HTML recursively
 */
function makeHtmlRecursive(node: YNode, propStore: YPropStore, writer: HtmlWriter): void {
  if (node instanceof YPara) {
    makeParaHtml(node, propStore, writer);
  } else if (node instanceof YBody) {
    writer.writeOpenTag('div', { id: node.getId() });
    for (const child of node.getChildren()) {
      makeHtmlRecursive(child, propStore, writer);
    }
    writer.writeCloseTag('div');
  } else if (node instanceof YTable) {
    writer.writeOpenTag('table', { id: node.getId() });
    for (const child of node.getChildren()) {
      makeHtmlRecursive(child, propStore, writer);
    }
    writer.writeCloseTag('table');
  } else if (node instanceof YRow) {
    writer.writeOpenTag('tr', { id: node.getId() });
    for (const child of node.getChildren()) {
      makeHtmlRecursive(child, propStore, writer);
    }
    writer.writeCloseTag('tr');
  } else if (node instanceof YCell) {
    writer.writeOpenTag('td', { id: node.getId() });
    for (const child of node.getChildren()) {
      makeHtmlRecursive(child, propStore, writer);
    }
    writer.writeCloseTag('td');
  }
}
