import { Database } from './database.js';
import { parseDocument } from 'htmlparser2';
import render from 'dom-serializer';

export interface FormatProperty {
  prop: string;
  value: any;
}

export interface RangeFormat {
  range_id: string;
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

// Helper to apply formatting properties to a DOM node
function applyFormattingToNode(node: any, properties: FormatProperty[]): void {
  if (node.type !== 'tag') return;

  // Initialize style object from existing style attribute
  const existingStyle = node.attribs?.style || '';
  const styleMap: Record<string, string> = {};

  // Parse existing styles
  if (existingStyle) {
    existingStyle.split(';').forEach((rule: string) => {
      const [prop, val] = rule.split(':').map(s => s.trim());
      if (prop && val) {
        styleMap[prop] = val;
      }
    });
  }

  // Apply each property
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
      // Store Word-specific properties as data attributes for later processing
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
        node.attribs = node.attribs || {};
        node.attribs[`data-word-${prop.toLowerCase()}`] = String(value);
        break;
    }
  }

  // Rebuild style attribute
  const newStyle = Object.entries(styleMap)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');

  if (newStyle) {
    node.attribs = node.attribs || {};
    node.attribs.style = newStyle;
  }
}

// Helper to find and format nodes within a range
function formatNodesInRange(
  node: any,
  startId: string | null,
  endId: string | null,
  properties: FormatProperty[],
  state: { inRange: boolean; foundStart: boolean; foundEnd: boolean }
): void {
  if (node.type === 'tag') {
    const nodeId = node.attribs?.id || null;

    // Check if we've found the start
    if (!state.foundStart && nodeId === startId) {
      state.foundStart = true;
      state.inRange = true;
    }

    // Apply formatting if we're in range
    if (state.inRange) {
      applyFormattingToNode(node, properties);
    }

    // Check if we've found the end
    if (state.inRange && nodeId === endId) {
      state.foundEnd = true;
      state.inRange = false;
    }
  }

  // Recursively process children
  if (node.children && !state.foundEnd) {
    for (const child of node.children) {
      formatNodesInRange(child, startId, endId, properties, state);
      if (state.foundEnd) break;
    }
  }
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

    // Get all HTML parts for this document
    const parts = await database.getAllHtmlParts(docid);

    if (parts.length === 0) {
      throw new Error(`No HTML parts found for document: ${docid}`);
    }

    // We'll work with the main part (partid='0')
    const mainPart = parts.find(p => p.partid === '0');

    if (!mainPart) {
      throw new Error(`Main document part (partid='0') not found for docid: ${docid}`);
    }

    // Parse the HTML
    const document = parseDocument(mainPart.html, {
      withStartIndices: false,
      withEndIndices: false
    });

    const rangeResults: Array<{ range_id: string; status: string; message?: string }> = [];
    let successCount = 0;

    // Process each range
    for (const rangeFormat of ranges) {
      const { range_id, properties } = rangeFormat;

      // Try to get range from cache
      const cachedRange = getCachedRange(range_id);

      if (!cachedRange) {
        rangeResults.push({
          range_id,
          status: 'error',
          message: `Range ID ${range_id} not found in cache. Call find_ranges first.`
        });
        continue;
      }

      const { start_id, end_id } = cachedRange;

      if (!start_id || !end_id) {
        rangeResults.push({
          range_id,
          status: 'error',
          message: `Range ${range_id} has null start_id or end_id`
        });
        continue;
      }

      // Apply formatting to nodes in range
      const state = { inRange: false, foundStart: false, foundEnd: false };
      for (const child of document.children) {
        formatNodesInRange(child, start_id, end_id, properties, state);
        if (state.foundEnd) break;
      }

      if (!state.foundStart) {
        rangeResults.push({
          range_id,
          status: 'error',
          message: `Start ID ${start_id} not found in document`
        });
      } else if (!state.foundEnd) {
        rangeResults.push({
          range_id,
          status: 'error',
          message: `End ID ${end_id} not found in document`
        });
      } else {
        rangeResults.push({
          range_id,
          status: 'success'
        });
        successCount++;
      }
    }

    // Serialize the modified document back to HTML
    const updatedHtml = render(document);

    // Update the database with the formatted HTML
    await database.updateHtmlPart(docid, '0', updatedHtml);

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
