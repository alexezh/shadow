#!/usr/bin/env node

import * as fs from 'fs/promises';
import * as path from 'path';
import { parseDocument } from 'htmlparser2';
import { fileURLToPath } from 'url';
import { make31BitId } from '../om/make31bitid.js';

const __filename = fileURLToPath(import.meta.url);

function addIdsToElements(node: any): void {
  // Tags that should get IDs
  const targetTags = ['p', 'table', 'tr', 'td', 'th', 'tbody', 'thead', 'tfoot', 'div'];

  if (node.type === 'tag' && targetTags.includes(node.name.toLowerCase())) {
    // Check if the element already has an id attribute
    if (!node.attribs || !node.attribs.id) {
      if (!node.attribs) {
        node.attribs = {};
      }
      node.attribs.id = make31BitId();
    }
  }

  // Recursively process children
  if (node.children) {
    node.children.forEach(addIdsToElements);
  }
}

function serializeNode(node: any): string {
  if (node.type === 'text') {
    return node.data || '';
  }

  if (node.type === 'comment') {
    return `<!--${node.data || ''}-->`;
  }

  if (node.type === 'directive') {
    return `<${node.data || ''}>`;
  }

  if (node.type === 'doctype') {
    return `<!DOCTYPE ${node.name || 'html'}>`;
  }

  if (node.type === 'tag') {
    let html = `<${node.name}`;

    // Add attributes
    if (node.attribs && typeof node.attribs === 'object') {
      for (const [key, value] of Object.entries(node.attribs)) {
        // Escape attribute values
        const escapedValue = String(value).replace(/"/g, '&quot;');
        html += ` ${key}="${escapedValue}"`;
      }
    }

    // Self-closing tags
    const selfClosingTags = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
    if (selfClosingTags.includes(node.name.toLowerCase())) {
      html += ' />';
      return html;
    }

    html += '>';

    // Add children
    if (node.children && Array.isArray(node.children)) {
      html += node.children.map(serializeNode).join('');
    }

    html += `</${node.name}>`;
    return html;
  }

  return '';
}

export function addIdsToHtml(content: string): string {
  try {
    const document = parseDocument(content, {
      withStartIndices: false,
      withEndIndices: false
    });

    // Process all nodes in the document
    document.children.forEach(addIdsToElements);

    // Serialize back to HTML
    return document.children.map(serializeNode).join('');
  } catch (error) {
    console.error('Error parsing HTML:', error);
    throw error;
  }
}

async function processHtmlFile(filePath: string): Promise<void> {
  try {
    // Read the file
    const content = await fs.readFile(filePath, 'utf-8');

    // Process the content
    const processedContent = addIdsToHtml(content);

    // Write back to the same file
    await fs.writeFile(filePath, processedContent, 'utf-8');

    console.log(`✅ Successfully added IDs to: ${filePath}`);
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npx ts-node src/htmlid.ts <html-file>');
    console.log('       node dist/htmlid.js <html-file>');
    console.log('       npm run htmlid <html-file>');
    process.exit(1);
  }

  const filePath = args[0];

  // Check if file exists
  try {
    await fs.access(filePath);
  } catch (error) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  // Check if file has .html or .htm extension
  if (!filePath.endsWith('.html') && !filePath.endsWith('.htm')) {
    console.error(`❌ File must have .html or .htm extension: ${filePath}`);
    process.exit(1);
  }

  await processHtmlFile(filePath);
}

// Run the script if called directly
if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

