import * as cheerio from 'cheerio';
import { YNode } from './YNode.js';
import { YPara } from './YPara.js';
import { YBody } from './YBody.js';
import { YTable } from './YTable.js';
import { YRow } from './YRow.js';
import { YCell } from './YCell.js';
import { YStr } from './YStr.js';
import { YPropStore } from './YPropStore.js';
import { YPropSet } from './YPropSet.js';
import { make31BitId } from '../make31bitid.js';

/**
 * Load HTML and return root WNode
 * @param html HTML string to parse
 * @param propStore Property store to use for parsing styles
 * @returns Root WNode (typically WBody)
 */
export function loadHtml(html: string, propStore: YPropStore): YNode {
  const $ = cheerio.load(html);

  // Try to find explicit body tag
  let body = $('body');

  // If body exists and has attributes/children that are not auto-generated
  if (body.length > 0 && body.children().length > 0) {
    const bodyId = body.attr('id') || 'body';
    const bodyNode = new YBody(bodyId);
    parseChildren($, body, bodyNode, propStore);
    return bodyNode;
  }

  // No meaningful body tag, parse root content directly
  // This handles cases like: <p>text</p> or <div><p>text</p></div>
  const bodyNode = new YBody('body');

  // Cheerio automatically wraps content in html/body
  // So we look for the auto-generated body's children
  const autoBody = $('body');
  if (autoBody.length > 0 && autoBody.children().length > 0) {
    parseChildren($, autoBody, bodyNode, propStore);
  } else {
    // Fallback: parse root children
    parseChildren($, $.root(), bodyNode, propStore);
  }

  return bodyNode;
}

/**
 * Parse children of an element and add them to parent node
 */
function parseChildren(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  parent: YNode,
  propStore: YPropStore
): void {
  element.children().each((_index, child) => {
    const node = parseElement($, $(child), propStore);
    if (node) {
      // Use addChild method if parent is a container type
      if (parent instanceof YBody || parent instanceof YTable ||
        parent instanceof YRow || parent instanceof YCell) {
        (parent as any).addChild(node);
      }
    }
  });
}

/**
 * Parse a single element into a WNode
 */
function parseElement(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  propStore: YPropStore
): YNode | null {
  const tagName = element.prop('tagName')?.toLowerCase();
  const id = element.attr('id') || make31BitId();

  switch (tagName) {
    case 'p':
      return parseParagraph($, element, id, propStore);

    case 'table':
      return parseTable($, element, id, propStore);

    case 'tr':
      return parseRow($, element, id, propStore);

    case 'td':
    case 'th':
      return parseCell($, element, id, propStore);

    case 'div':
      // Treat div as body-like container
      const divNode = new YBody(id);
      parseChildren($, element, divNode, propStore);
      return divNode;

    default:
      // Skip unknown elements or return null
      return null;
  }
}

/**
 * Parse a paragraph element
 */
function parseParagraph(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  id: string,
  propStore: YPropStore
): YPara {
  const str = new YStr();
  parseTextContent($, element, str, propStore);
  return new YPara(id, str);
}

/**
 * Parse text content with inline formatting
 */
function parseTextContent(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  str: YStr,
  propStore: YPropStore,
  basePropId: number = 0
): void {
  element.contents().each((_index, node) => {
    if (node.type === 'text') {
      // Plain text node
      const text = $(node).text();
      str.append(text, basePropId);
    } else if (node.type === 'tag') {
      // Inline formatting tag
      const $node = $(node);
      const tagName = $node.prop('tagName')?.toLowerCase();

      // Extract style from tag
      const propSet = new YPropSet();
      const styleAttr = $node.attr('style');
      if (styleAttr) {
        parseInlineStyle(styleAttr, propSet);
      }

      // Add tag-specific properties
      if (tagName === 'b' || tagName === 'strong') {
        propSet.set('font-weight', 'bold');
      } else if (tagName === 'i' || tagName === 'em') {
        propSet.set('font-style', 'italic');
      } else if (tagName === 'u') {
        propSet.set('text-decoration', 'underline');
      } else if (tagName === 'span') {
        // Span with style only
      } else if (tagName === 'br') {
        // Line break
        str.append('\n', basePropId);
        return;
      }

      // Get or create property ID
      const prop = propStore.getOrCreate(propSet);

      // Recursively parse content
      parseTextContent($, $node, str, propStore, prop.getHash());
    }
  });
}

/**
 * Parse inline CSS style attribute
 */
function parseInlineStyle(styleAttr: string, propSet: YPropSet): void {
  const styles = styleAttr.split(';');
  for (const style of styles) {
    const [key, value] = style.split(':').map(s => s.trim());
    if (key && value) {
      propSet.set(key, value);
    }
  }
}

/**
 * Parse table element
 */
function parseTable(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  id: string,
  propStore: YPropStore
): YTable {
  const table = new YTable(id);
  parseChildren($, element, table, propStore);
  return table;
}

/**
 * Parse table row element
 */
function parseRow(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  id: string,
  propStore: YPropStore
): YRow {
  const row = new YRow(id);
  parseChildren($, element, row, propStore);
  return row;
}

/**
 * Parse table cell element
 */
function parseCell(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  id: string,
  propStore: YPropStore
): YCell {
  const cell = new YCell(id);
  parseChildren($, element, cell, propStore);
  return cell;
}

