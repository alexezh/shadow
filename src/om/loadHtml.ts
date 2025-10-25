import * as cheerio from 'cheerio';
import { YNode } from './YNode.js';
import { YPara } from './YPara.js';
import { YBody } from './YBody.js';
import { YTable } from './YTable.js';
import { YRow } from './YRow.js';
import { YCell } from './YCell.js';
import { YStr } from './YStr.js';
import { YPropCache } from './YPropCache.js';
import { YPropSet } from './YPropSet.js';
import { YStyleStore } from './YStyleStore.js';
import { make31BitId } from '../make31bitid.js';

/**
 * Load HTML and return root WNode
 * @param html HTML string to parse
 * @param propStore Property store to use for parsing styles
 * @param styleStore Optional style store to populate with CSS styles
 * @returns Root WNode (typically WBody)
 */
export function loadHtml(html: string, propStore: YPropCache, styleStore?: YStyleStore): YNode {
  const $ = cheerio.load(html);

  // Extract and parse CSS from <style> tags
  if (styleStore) {
    $('style').each((_index, elem) => {
      const cssText = $(elem).text();
      if (cssText) {
        styleStore.parseCss(cssText);
      }
    });
  }

  // Try to find explicit body tag
  let body = $('body');

  // If body exists and has attributes/children that are not auto-generated
  if (body.length > 0 && body.children().length > 0) {
    const bodyId = body.attr('id') || 'body';
    const bodyPropSet = extractElementProps(body);
    const bodyNode = new YBody(bodyId, bodyPropSet);
    parseChildren($, body, bodyNode, propStore);
    return bodyNode;
  }

  // No meaningful body tag, parse root content directly
  // This handles cases like: <p>text</p> or <div><p>text</p></div>
  const bodyNode = new YBody('body', new YPropSet());

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
  propStore: YPropCache,
  parentPropSet: YPropSet = new YPropSet()
): void {
  const parentPropId = propStore.getOrCreate(parentPropSet).getHash();

  element.contents().each((_index, child) => {
    const $child = $(child);

    if (child.type === 'text') {
      // Text content - create paragraph for it
      const text = $child.text().trim();
      if (text.length > 0) {
        const str = new YStr();
        str.append(text, parentPropId);
        const para = new YPara(make31BitId(), parentPropSet, str);
        (parent as any).addChild(para);
      }
    } else if (child.type === 'tag') {
      const nodes = parseElement($, $child, propStore, parentPropSet);
      if (nodes) {
        for (const node of nodes) {
          if (parent instanceof YBody || parent instanceof YTable ||
            parent instanceof YRow || parent instanceof YCell) {
            (parent as any).addChild(node);
          }
        }
      }
    }
  });
}

/**
 * Extract element properties from HTML attributes
 */
function extractElementProps(
  element: cheerio.Cheerio<any>
): YPropSet {
  const propSet = new YPropSet();

  // Parse style attribute
  const styleAttr = element.attr('style');
  if (styleAttr) {
    parseInlineStyle(styleAttr, propSet);
  }

  // Parse other common attributes
  const alignAttr = element.attr('align');
  if (alignAttr) {
    propSet.set('text-align', alignAttr);
  }

  const widthAttr = element.attr('width');
  if (widthAttr) {
    propSet.set('width', widthAttr);
  }

  const heightAttr = element.attr('height');
  if (heightAttr) {
    propSet.set('height', heightAttr);
  }

  const bgcolorAttr = element.attr('bgcolor');
  if (bgcolorAttr) {
    propSet.set('background-color', bgcolorAttr);
  }

  const borderAttr = element.attr('border');
  if (borderAttr) {
    propSet.set('border-width', borderAttr);
  }

  const colspanAttr = element.attr('colspan');
  if (colspanAttr) {
    propSet.set('colspan', colspanAttr);
  }

  const rowspanAttr = element.attr('rowspan');
  if (rowspanAttr) {
    propSet.set('rowspan', rowspanAttr);
  }

  return propSet;
}

/**
 * Parse a single element into YNode(s)
 * Returns array because divs with mixed content may create multiple paragraphs
 */
function parseElement(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  propStore: YPropCache,
  parentPropSet: YPropSet = new YPropSet()
): YNode[] | null {
  const tagName = element.prop('tagName')?.toLowerCase();
  const id = element.attr('id') || make31BitId();

  switch (tagName) {
    case 'p':
      return [parseParagraph($, element, id, propStore)];

    case 'table': {
      const propSet = extractElementProps(element);
      const table = new YTable(id, propSet);
      parseChildren($, element, table, propStore, propSet);
      return [table];
    }

    case 'tbody':
      // tbody is transparent, just parse its children
      const tbodyNodes: YNode[] = [];
      element.children().each((_index, child) => {
        const nodes = parseElement($, $(child), propStore, parentPropSet);
        if (nodes) {
          tbodyNodes.push(...nodes);
        }
      });
      return tbodyNodes.length > 0 ? tbodyNodes : null;

    case 'tr': {
      const propSet = extractElementProps(element);
      const row = new YRow(id, propSet);
      parseChildren($, element, row, propStore, propSet);
      return [row];
    }

    case 'td':
    case 'th': {
      const propSet = extractElementProps(element);
      const cell = new YCell(id, propSet);
      parseChildren($, element, cell, propStore, propSet);
      return [cell];
    }

    case 'div': {
      // Check if div has only text content (no child elements)
      const hasChildElements = element.children().length > 0;
      const textContent = element.text().trim();

      if (!hasChildElements && textContent.length === 0) {
        // Empty div - don't create any node
        return null;
      }

      if (!hasChildElements && textContent.length > 0) {
        // Div with only text - create paragraph
        const propSet = extractElementProps(element);
        const propId = propStore.getOrCreate(propSet).getHash();
        const str = new YStr();
        parseTextContent($, element, str, propStore, propId);
        return [new YPara(id, propSet, str)];
      }

      // Div with mixed content or child elements
      const divNodes: YNode[] = [];
      let currentStr: YStr | null = null;
      const parentPropId = propStore.getOrCreate(parentPropSet).getHash();

      element.contents().each((_index, child) => {
        const $child = $(child);

        if (child.type === 'text') {
          const text = $child.text();
          if (text.trim().length > 0) {
            // Accumulate text in current string
            if (!currentStr) {
              currentStr = new YStr();
            }
            currentStr.append(text, parentPropId);
          }
        } else if (child.type === 'tag') {
          const childTagName = $child.prop('tagName')?.toLowerCase();

          // Check if this is an inline element
          const isInline = ['span', 'b', 'strong', 'i', 'em', 'u', 'br'].includes(childTagName || '');

          if (isInline) {
            // Inline element - add to current string
            if (!currentStr) {
              currentStr = new YStr();
            }
            parseTextContent($, $child, currentStr, propStore, parentPropId);
          } else {
            // Block element - flush current string as paragraph first
            if (currentStr && currentStr.length > 0) {
              divNodes.push(new YPara(make31BitId(), parentPropSet, currentStr));
              currentStr = null;
            }

            // Parse block element
            const nodes = parseElement($, $child, propStore, parentPropSet);
            if (nodes) {
              divNodes.push(...nodes);
            }
          }
        }
      });

      // Flush remaining text
      if (currentStr && currentStr.length > 0) {
        divNodes.push(new YPara(make31BitId(), parentPropSet, currentStr));
      }

      return divNodes.length > 0 ? divNodes : null;
    }

    default:
      // Unknown element - skip
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
  propStore: YPropCache
): YPara {
  // Capture paragraph-level properties
  const paraPropSet = extractElementProps(element);
  const paraPropId = propStore.getOrCreate(paraPropSet).getHash();

  const str = new YStr();
  parseTextContent($, element, str, propStore, paraPropId);

  return new YPara(id, paraPropSet, str);
}

/**
 * Parse text content with inline formatting
 */
function parseTextContent(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  str: YStr,
  propStore: YPropCache,
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
