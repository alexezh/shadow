import * as cheerio from 'cheerio';
import { WNode } from './WNode.js';
import { WPara } from './WPara.js';
import { WBody } from './WBody.js';
import { WTable } from './WTable.js';
import { WRow } from './WRow.js';
import { WCell } from './WCell.js';
import { WStr } from './WStr.js';
import { WPropStore } from './WPropStore.js';
import { WPropSet } from './WPropSet.js';

/**
 * Load HTML and return root WNode
 * @param html HTML string to parse
 * @param propStore Property store to use for parsing styles
 * @returns Root WNode (typically WBody)
 */
export function loadHtml(html: string, propStore: WPropStore): WNode {
  const $ = cheerio.load(html);
  const body = $('body');

  if (body.length === 0) {
    // No body tag, treat the entire HTML as body content
    const bodyNode = new WBody('body');
    parseChildren($, $.root(), bodyNode, propStore);
    return bodyNode;
  }

  const bodyId = body.attr('id') || 'body';
  const bodyNode = new WBody(bodyId);
  parseChildren($, body, bodyNode, propStore);

  return bodyNode;
}

/**
 * Parse children of an element and add them to parent node
 */
function parseChildren(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  parent: WNode,
  propStore: WPropStore
): void {
  element.children().each((_index, child) => {
    const node = parseElement($, $(child), propStore);
    if (node) {
      const children = parent.getChildren();
      if (children) {
        children.push(node);
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
  propStore: WPropStore
): WNode | null {
  const tagName = element.prop('tagName')?.toLowerCase();
  const id = element.attr('id') || generateId(tagName || 'node');

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
      const divNode = new WBody(id);
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
  propStore: WPropStore
): WPara {
  const str = new WStr();
  parseTextContent($, element, str, propStore);
  return new WPara(id, str);
}

/**
 * Parse text content with inline formatting
 */
function parseTextContent(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  str: WStr,
  propStore: WPropStore,
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
      const propSet = new WPropSet();
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
      const propId = propStore.getOrCreateId(propSet);

      // Recursively parse content
      parseTextContent($, $node, str, propStore, propId);
    }
  });
}

/**
 * Parse inline CSS style attribute
 */
function parseInlineStyle(styleAttr: string, propSet: WPropSet): void {
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
  propStore: WPropStore
): WTable {
  const table = new WTable(id);
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
  propStore: WPropStore
): WRow {
  const row = new WRow(id);
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
  propStore: WPropStore
): WCell {
  const cell = new WCell(id);
  parseChildren($, element, cell, propStore);
  return cell;
}

/**
 * Generate a unique ID for a node
 */
let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${idCounter++}`;
}
