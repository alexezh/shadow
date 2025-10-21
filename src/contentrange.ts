import path from "path";
import * as fs from 'fs/promises';
import { Database } from './database.js';
import { parseDocument } from 'htmlparser2';
import render from 'dom-serializer';

// Helper to extract all paragraphs from parsed document
function extractParagraphs(node: any, paragraphs: Array<{ id: string | null, node: any }> = []): Array<{ id: string | null, node: any }> {
  // Tags that we consider as paragraphs
  const paragraphTags = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th'];

  if (node.type === 'tag' && paragraphTags.includes(node.name.toLowerCase())) {
    const id = node.attribs?.id || null;
    paragraphs.push({ id, node });
  }

  // Recursively process children
  if (node.children) {
    for (const child of node.children) {
      extractParagraphs(child, paragraphs);
    }
  }

  return paragraphs;
}

export async function getContentRange(args: {
  docid: string;
  format: string;
  start_para?: string;
  end_para?: string;
}, database: Database): Promise<string> {
  try {
    // Get all HTML parts for this document
    const parts = await database.getAllHtmlParts(args.docid);

    if (parts.length === 0) {
      throw new Error(`No HTML parts found for document: ${args.docid}`);
    }

    // Start with main part '0', or use all parts in order
    let content: string;
    const mainPart = parts.find(p => p.partid === '0');

    if (mainPart) {
      content = mainPart.html;
    } else {
      console.warn(`⚠️ Main document part (partid='0') not found for docid: ${args.docid}, using all parts`);
      content = parts.map(p => p.html).join('\n');
    }

    // Parse the HTML
    const document = parseDocument(content, {
      withStartIndices: false,
      withEndIndices: false
    });

    // Extract all paragraphs
    let allParagraphs: Array<{ id: string | null, node: any }> = [];
    for (const child of document.children) {
      extractParagraphs(child, allParagraphs);
    }

    // If no range specified, return first 100 paragraphs
    if (!args.start_para && !args.end_para) {
      const selectedParagraphs = allParagraphs.slice(0, 100);
      const htmlOutput = selectedParagraphs.map(p => render(p.node)).join('\n');
      return htmlOutput;
    }

    // Find start and end indices based on paragraph IDs
    let startIndex = 0;
    let endIndex = allParagraphs.length - 1;

    if (args.start_para) {
      const foundIndex = allParagraphs.findIndex(p => p.id === args.start_para);
      if (foundIndex !== -1) {
        startIndex = foundIndex;
      }
    }

    if (args.end_para) {
      const foundIndex = allParagraphs.findIndex(p => p.id === args.end_para);
      if (foundIndex !== -1) {
        endIndex = foundIndex;
      }
    }

    // Extract the range (max 100 paragraphs)
    const selectedParagraphs = allParagraphs.slice(startIndex, Math.min(endIndex + 1, startIndex + 100));
    const htmlOutput = selectedParagraphs.map(p => render(p.node)).join('\n');

    return htmlOutput;
  } catch (error: any) {
    throw error;
  }
}
