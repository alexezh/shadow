import { Database } from './database.js';
import * as cheerio from 'cheerio';
import { ChunkedDoc } from './chunkedDoc.js';

export interface FormatProperty {
  prop: string;
  value: any;
}

export interface RangeFormat {
  range_id?: string;
  start_id?: string;
  end_id?: string;
  text?: string;
  start_text?: string;
  end_text?: string;
  properties: FormatProperty[];
}

export interface FormatRangeOptions {
  docid: string;
  ranges: RangeFormat[];
}

// Cache to store range_id -> {start_id, end_id} mappings
const rangeCache = new Map<string, { start_id: string | null; end_id: string | null }>();

export function cacheRange(range_id: string, start_id: string | null, end_id: string | null): void {
  rangeCache.set(range_id, { start_id, end_id });
}

export function getCachedRange(range_id: string): { start_id: string | null; end_id: string | null } | undefined {
  return rangeCache.get(range_id);
}

export function clearRangeCache(): void {
  rangeCache.clear();
}

// Helper to build CSS style string from properties
function buildStyleFromProperties(properties: FormatProperty[]): Record<string, string> {
  const styleMap: Record<string, string> = {};

  for (const { prop, value } of properties) {
    switch (prop) {
      case 'fontFamily':
        styleMap['font-family'] = value;
        break;
      case 'fontSize':
        styleMap['font-size'] = typeof value === 'number' ? `${value}pt` : value;
        break;
      case 'color':
        styleMap['color'] = value;
        break;
      case 'backgroundColor':
        styleMap['background-color'] = value;
        break;
      case 'bold':
        styleMap['font-weight'] = value ? 'bold' : 'normal';
        break;
      case 'italic':
        styleMap['font-style'] = value ? 'italic' : 'normal';
        break;
      case 'underline':
        if (value === 'none') {
          styleMap['text-decoration'] = 'none';
        } else {
          styleMap['text-decoration'] = 'underline';
          if (value === 'double') {
            styleMap['text-decoration-style'] = 'double';
          } else if (value === 'dotted') {
            styleMap['text-decoration-style'] = 'dotted';
          }
        }
        break;
      case 'strikethrough':
        if (value) {
          const existing = styleMap['text-decoration'] || '';
          styleMap['text-decoration'] = existing ? `${existing} line-through` : 'line-through';
        }
        break;
      case 'allCaps':
        styleMap['text-transform'] = value ? 'uppercase' : 'none';
        break;
      case 'smallCaps':
        styleMap['font-variant'] = value ? 'small-caps' : 'normal';
        break;
    }
  }

  return styleMap;
}

// Helper to get Word-specific data attributes from properties
function getWordDataAttributes(properties: FormatProperty[]): Record<string, string> {
  const dataAttrs: Record<string, string> = {};

  for (const { prop, value } of properties) {
    switch (prop) {
      case 'doubleStrikethrough':
      case 'superscript':
      case 'subscript':
      case 'shadow':
      case 'outline':
      case 'emboss':
      case 'engrave':
      case 'spacing':
      case 'scaling':
      case 'kerning':
      case 'highlightPattern':
        dataAttrs[`data-word-${prop.toLowerCase()}`] = String(value);
        break;
    }
  }

  return dataAttrs;
}

// Helper to wrap specific text within an element with a span
function wrapTextInSpan($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>, text: string, styleProps: Record<string, string>, dataAttrs: Record<string, string>): boolean {
  // Get the HTML content of the element
  const html = $element.html();
  if (!html) return false;

  // Find the text position
  const textIndex = html.indexOf(text);
  if (textIndex === -1) return false;

  // Build style string
  const styleStr = Object.entries(styleProps)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');

  // Build data attributes string
  const dataAttrStr = Object.entries(dataAttrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');

  // Create the wrapped version
  const before = html.substring(0, textIndex);
  const after = html.substring(textIndex + text.length);
  const wrapped = `${before}<span style="${styleStr}" ${dataAttrStr}>${text}</span>${after}`;

  $element.html(wrapped);
  return true;
}

export async function formatRange(
  options: FormatRangeOptions,
  database: Database
): Promise<{
  success: boolean;
  docid: string;
  ranges_formatted: number;
  ranges: Array<{ range_id: string; status: string; message?: string }>;
  error?: string;
}> {
  try {
    const { docid, ranges } = options;

    // Load document as ChunkedDoc
    const doc = new ChunkedDoc(docid);
    await doc.load(database);

    const rangeResults: Array<{ range_id: string; status: string; message?: string }> = [];
    let successCount = 0;

    // Process each range
    for (const rangeFormat of ranges) {
      const { range_id, start_id: explicitStartId, end_id: explicitEndId, text, start_text, end_text, properties } = rangeFormat;

      let start_id: string | null = null;
      let end_id: string | null = null;
      const rangeIdForLog = range_id || `${explicitStartId}:${explicitEndId}`;

      // Determine start_id and end_id from range_id (cache) or explicit IDs
      if (range_id) {
        const cachedRange = getCachedRange(range_id);
        if (!cachedRange) {
          rangeResults.push({
            range_id: rangeIdForLog,
            status: 'error',
            message: `Range ID ${range_id} not found in cache. Call find_ranges first.`
          });
          continue;
        }
        start_id = cachedRange.start_id;
        end_id = cachedRange.end_id;
      } else if (explicitStartId && explicitEndId) {
        start_id = explicitStartId;
        end_id = explicitEndId;
      } else {
        rangeResults.push({
          range_id: rangeIdForLog,
          status: 'error',
          message: 'Must provide either range_id or both start_id and end_id'
        });
        continue;
      }

      if (!start_id || !end_id) {
        rangeResults.push({
          range_id: rangeIdForLog,
          status: 'error',
          message: `Range has null start_id or end_id`
        });
        continue;
      }

      // Find start and end paragraphs using ChunkedDoc
      const startPara = doc.getParagraph(start_id);
      const endPara = doc.getParagraph(end_id);

      if (!startPara) {
        rangeResults.push({
          range_id: rangeIdForLog,
          status: 'error',
          message: `Start ID ${start_id} not found in document`
        });
        continue;
      }

      if (!endPara) {
        rangeResults.push({
          range_id: rangeIdForLog,
          status: 'error',
          message: `End ID ${end_id} not found in document`
        });
        continue;
      }

      // Get cheerio instances for the parts containing start and end
      const $start = startPara.$element;
      const $end = endPara.$element;
      const startCheerio = doc.getCheerio(startPara.partid);
      const endCheerio = doc.getCheerio(endPara.partid);

      if (!startCheerio || !endCheerio) {
        rangeResults.push({
          range_id: rangeIdForLog,
          status: 'error',
          message: 'Could not get cheerio instance for parts'
        });
        continue;
      }

      // Build style and data attributes
      const styleProps = buildStyleFromProperties(properties);
      const dataAttrs = getWordDataAttributes(properties);

      // Handle text-based selection
      if (text && start_id === end_id) {
        // Single paragraph: wrap the specific text in a span
        const wrapped = wrapTextInSpan(startCheerio, $start, text, styleProps, dataAttrs);
        if (!wrapped) {
          rangeResults.push({
            range_id: rangeIdForLog,
            status: 'error',
            message: `Text "${text}" not found in element ${start_id}`
          });
          continue;
        }
        rangeResults.push({
          range_id: rangeIdForLog,
          status: 'success'
        });
        successCount++;
        continue;
      } else if (start_text && end_text && start_id !== end_id) {
        // Multi-paragraph: wrap start_text in start element, end_text in end element, and all elements in between
        const wrappedStart = wrapTextInSpan(startCheerio, $start, start_text, styleProps, dataAttrs);
        const wrappedEnd = wrapTextInSpan(endCheerio, $end, end_text, styleProps, dataAttrs);

        if (!wrappedStart) {
          rangeResults.push({
            range_id: rangeIdForLog,
            status: 'error',
            message: `Start text "${start_text}" not found in element ${start_id}`
          });
          continue;
        }

        if (!wrappedEnd) {
          rangeResults.push({
            range_id: rangeIdForLog,
            status: 'error',
            message: `End text "${end_text}" not found in element ${end_id}`
          });
          continue;
        }

        // Apply formatting to all paragraphs between start and end (exclusive)
        const rangeParagraphs = doc.getParagraphRange(start_id, end_id);
        for (let i = 1; i < rangeParagraphs.length - 1; i++) {
          const para = rangeParagraphs[i];
          for (const [cssProp, cssValue] of Object.entries(styleProps)) {
            para.$element.css(cssProp, cssValue);
          }
          for (const [attrName, attrValue] of Object.entries(dataAttrs)) {
            para.$element.attr(attrName, attrValue);
          }
        }

        rangeResults.push({
          range_id: rangeIdForLog,
          status: 'success'
        });
        successCount++;
        continue;
      }

      // No text specified: apply formatting to all paragraphs from start to end (inclusive)
      const rangeParagraphs = doc.getParagraphRange(start_id, end_id);

      for (const para of rangeParagraphs) {
        // Apply CSS styles
        for (const [cssProp, cssValue] of Object.entries(styleProps)) {
          para.$element.css(cssProp, cssValue);
        }

        // Apply Word-specific data attributes
        for (const [attrName, attrValue] of Object.entries(dataAttrs)) {
          para.$element.attr(attrName, attrValue);
        }
      }

      rangeResults.push({
        range_id: rangeIdForLog,
        status: 'success'
      });
      successCount++;
    }

    // Save all modified parts back to database
    await doc.save(database);

    console.log(`✨ Formatted ${successCount}/${ranges.length} ranges in document ${docid}`);

    return {
      success: successCount > 0,
      docid,
      ranges_formatted: successCount,
      ranges: rangeResults
    };

  } catch (error: any) {
    console.error('❌ Error formatting ranges:', error);
    return {
      success: false,
      docid: options.docid,
      ranges_formatted: 0,
      ranges: [],
      error: error.message
    };
  }
}
