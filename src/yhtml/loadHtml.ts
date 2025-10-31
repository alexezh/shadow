import * as cheerio from 'cheerio';
import { YNode, YTextContainer } from '../om/YNode.js';
import { YPara } from '../om/YPara.js';
import { YBody } from '../om/YBody.js';
import { YTable } from '../om/YTable.js';
import { YRow } from '../om/YRow.js';
import { YCell } from '../om/YCell.js';
import { YStr } from '../om/YStr.js';
import { YPropSet } from '../om/YPropSet.js';
import { YStyleStore } from '../om/YStyleStore.js';
import { make31BitId } from '../om/make31bitid.js';

/**
 * Load HTML and return root WNode
 * @param html HTML string to parse
 * @param styleStore Optional style store to populate with CSS styles
 * @returns Root WNode (typically WBody)
 */
export function loadHtml(html: string, styleStore?: YStyleStore): YNode {
  const $ = cheerio.load(html);

  // Extract and parse CSS from <style> tags before removing them
  if (styleStore) {
    $('style').each((_index, elem) => {
      const cssText = $(elem).text();
      if (cssText) {
        styleStore.parseCss(cssText);
      }
    });
  }

  // Remove script, style, and other non-content tags to prevent their text content from being extracted
  $('script, style, noscript, head, meta, link, title').remove();

  // Try to find explicit body tag
  let body = $('body');

  // If body exists and has attributes/children that are not auto-generated
  if (body.length > 0 && body.children().length > 0) {
    const bodyId = body.attr('id') || 'body';
    const bodyProps = extractElementProps(body);
    const bodyNode = new YBody(bodyId, YPropSet.create(bodyProps));
    parseChildren($, body, bodyNode);
    return bodyNode;
  }

  // No meaningful body tag, parse root content directly
  // This handles cases like: <p>text</p> or <div><p>text</p></div>
  const bodyNode = new YBody('body', YPropSet.create({}));

  // Cheerio automatically wraps content in html/body
  // So we look for the auto-generated body's children
  const autoBody = $('body');
  if (autoBody.length > 0 && autoBody.children().length > 0) {
    parseChildren($, autoBody, bodyNode);
  } else {
    // Fallback: parse root children
    parseChildren($, $.root(), bodyNode);
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
  parentProps: { [key: string]: any } = {}
): void {
  element.contents().each((_index, child) => {
    const $child = $(child);

    if (child.type === 'text') {
      // Text content - create paragraph for it
      const text = $child.text().trim();
      if (text.length > 0) {
        const str = new YStr();
        const parentPropSet = YPropSet.create(parentProps);
        str.append(text, parentPropSet);
        const para = new YPara(make31BitId(), parentPropSet, str);
        (parent as any).addChild(para);
      }
    } else if (child.type === 'tag') {
      const nodes = parseElement($, $child, parentProps);
      if (nodes) {
        for (const node of nodes) {
          if (parent instanceof YTextContainer) {
            (parent as any).addChild(node);
          }
        }
      }
    }
  });
}

/**
 * Extract element properties from HTML attributes
 * Returns plain object that can be used to create YPropSet later
 */
function extractElementProps(
  element: cheerio.Cheerio<any>
): { [key: string]: any } {
  const props: { [key: string]: any } = {};

  // Parse style attribute
  const styleAttr = element.attr('style');
  if (styleAttr) {
    parseInlineStyle(styleAttr, props);
  }

  // Parse other common attributes
  const alignAttr = element.attr('align');
  if (alignAttr) {
    props['text-align'] = alignAttr;
  }

  const widthAttr = element.attr('width');
  if (widthAttr) {
    props['width'] = widthAttr;
  }

  const heightAttr = element.attr('height');
  if (heightAttr) {
    props['height'] = heightAttr;
  }

  const bgcolorAttr = element.attr('bgcolor');
  if (bgcolorAttr) {
    props['background-color'] = bgcolorAttr;
  }

  const borderAttr = element.attr('border');
  if (borderAttr) {
    props['border-width'] = borderAttr;
  }

  const colspanAttr = element.attr('colspan');
  if (colspanAttr) {
    props['colspan'] = colspanAttr;
  }

  const rowspanAttr = element.attr('rowspan');
  if (rowspanAttr) {
    props['rowspan'] = rowspanAttr;
  }

  return props;
}

/**
 * Parse a single element into YNode(s)
 * Returns array because divs with mixed content may create multiple paragraphs
 */
function parseElement(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  parentProps: { [key: string]: any } = {}
): YNode[] | null {
  const tagName = element.prop('tagName')?.toLowerCase();
  const id = element.attr('id') || make31BitId();

  switch (tagName) {
    case 'p':
      return [parseParagraph($, element, id)];

    case 'table': {
      const props = extractElementProps(element);
      const table = new YTable(id, YPropSet.create(props));
      parseChildren($, element, table, props);
      return [table];
    }

    case 'tbody':
      // tbody is transparent, just parse its children
      const tbodyNodes: YNode[] = [];
      element.children().each((_index, child) => {
        const nodes = parseElement($, $(child), parentProps);
        if (nodes) {
          tbodyNodes.push(...nodes);
        }
      });
      return tbodyNodes.length > 0 ? tbodyNodes : null;

    case 'tr': {
      const props = extractElementProps(element);
      const row = new YRow(id, YPropSet.create(props));
      parseChildren($, element, row, props);
      return [row];
    }

    case 'td':
    case 'th': {
      const props = extractElementProps(element);
      const cell = new YCell(id, YPropSet.create(props));
      const divNodes = parseDivLike($, element, id, parentProps);
      cell.insertAfter(undefined, ...divNodes);
      return [cell];
    }

    // Ignore script, style, and other non-content tags
    case 'script':
    case 'style':
    case 'noscript':
    case 'head':
    case 'meta':
    case 'link':
    case 'title':
      return null;

    // first 3 used to skip GDoc wrappers
    case 'b':
    case 'i':
    case 'span':
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
    case 'h7':
    case 'h8':
    case 'div': {
      const divNodes = parseDivLike($, element, id, parentProps);

      return divNodes.length > 0 ? divNodes : null;
    }

    default:
      // Unknown element - skip
      return null;
  }
}

function parseDivLike(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  id: string,
  parentProps: { [key: string]: any } = {}
): YNode[] {
  // Check if div has only text content (no child elements)
  const hasChildElements = element.children().length > 0;
  const textContent = element.text().trim();

  if (!hasChildElements && textContent.length === 0) {
    // Empty div - don't create any node
    return [];
  }

  if (!hasChildElements && textContent.length > 0) {
    // Div with only text - create paragraph
    const props = extractElementProps(element);
    const propSet = YPropSet.create(props);
    const str = new YStr();
    parseTextContent($, element, str, propSet);
    return [new YPara(id, propSet, str)];
  }

  // Div with mixed content or child elements
  const divNodes: YNode[] = [];
  let currentStr: YStr | null = null;
  const parentPropSet = YPropSet.create(parentProps);

  for (const child of element.contents()) {
    const $child = $(child);

    if (child.type === 'text') {
      const text = $child.text();
      if (text.trim().length > 0) {
        // Accumulate text in current string
        if (!currentStr) {
          currentStr = new YStr();
        }
        currentStr.append(text, parentPropSet);
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
        parseTextContent($, $child, currentStr, parentPropSet);
      } else {
        // Block element - flush current string as paragraph first
        if (currentStr && currentStr.length > 0) {
          divNodes.push(new YPara(make31BitId(), parentPropSet, currentStr));
          currentStr = null;
        }

        // Parse block element
        const nodes = parseElement($, $child, parentProps);
        if (nodes) {
          divNodes.push(...nodes);
        }
      }
    }
  }

  // Flush remaining text
  // @ts-ignore
  if (currentStr && currentStr.length > 0) {
    divNodes.push(new YPara(make31BitId(), parentPropSet, currentStr));
  }

  return divNodes;
}

/**
 * Parse a paragraph element
 */
function parseParagraph(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  id: string
): YPara {
  // Capture paragraph-level properties
  const paraProps = extractElementProps(element);
  const paraPropSet = YPropSet.create(paraProps);

  const str = new YStr();
  parseTextContent($, element, str, paraPropSet);

  return new YPara(id, paraPropSet, str);
}

/**
 * Parse text content with inline formatting
 */
function parseTextContent(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  str: YStr,
  basePropSet: YPropSet = YPropSet.create({})
): void {
  for (const node of element.contents()) {
    if (node.type === 'text') {
      // Plain text node
      const text = $(node).text();
      str.append(text, basePropSet);
    } else if (node.type === 'tag') {
      // Inline formatting tag
      const $node = $(node);
      const tagName = $node.prop('tagName')?.toLowerCase();

      // Extract style from tag - accumulate in plain object
      const props: { [key: string]: any } = {};
      const styleAttr = $node.attr('style');
      if (styleAttr) {
        parseInlineStyle(styleAttr, props);
      }

      // Add tag-specific properties
      if (tagName === 'b' || tagName === 'strong') {
        props['font-weight'] = 'bold';
      } else if (tagName === 'i' || tagName === 'em') {
        props['font-style'] = 'italic';
      } else if (tagName === 'u') {
        props['text-decoration'] = 'underline';
      } else if (tagName === 'span') {
        // Span with style only
      } else if (tagName === 'br') {
        // Line break
        str.append('\n', basePropSet);
        return;
      }

      // Create YPropSet from accumulated properties
      const propSet = YPropSet.create(props);

      // Recursively parse content
      parseTextContent($, $node, str, propSet);
    }
  }
}

/**
 * Parse inline CSS style attribute into a plain object
 */
function parseInlineStyle(styleAttr: string, props: { [key: string]: any }): void {
  const styles = styleAttr.split(';');
  for (const style of styles) {
    const [key, value] = style.split(':').map(s => s.trim());
    if (key && value) {
      props[key] = value;
    }
  }
}
