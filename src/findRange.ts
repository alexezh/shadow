import * as fs from 'fs/promises';
import * as path from 'path';
import { Database } from './database.js';
import { parseDocument } from 'htmlparser2';
import OpenAI from 'openai';
import { make31BitId } from './make31bitid.js';

export interface FindRangeResult {
  range_id: string;
  start_id: string | null;
  end_id: string | null;
  paragraph_count: number;
  preview: string;
}

export interface FindRangeOptions {
  docid: string;
  pattern: string;
  match_type: 'exact' | 'regex' | 'semantic';
  context_lines?: number;
}

// Helper to extract all paragraphs with IDs from parsed document
function extractParagraphsWithIds(node: any, paragraphs: Array<{ id: string | null, text: string }> = []): Array<{ id: string | null, text: string }> {
  const paragraphTags = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th'];

  if (node.type === 'tag' && paragraphTags.includes(node.name.toLowerCase())) {
    const id = node.attribs?.id || null;

    // Extract text content from this node
    let text = '';
    function extractText(n: any): void {
      if (n.type === 'text') {
        text += n.data;
      } else if (n.children) {
        for (const child of n.children) {
          extractText(child);
        }
      }
    }
    extractText(node);

    paragraphs.push({ id, text: text.trim() });
  }

  // Recursively process children
  if (node.children) {
    for (const child of node.children) {
      extractParagraphsWithIds(child, paragraphs);
    }
  }

  return paragraphs;
}

export async function findRanges(options: FindRangeOptions, database: Database, openaiClient?: OpenAI): Promise<{
  document: string;
  pattern: string;
  match_type: string;
  ranges_found: number;
  ranges: FindRangeResult[];
}> {
  const contextLines = options.context_lines || 0;

  try {
    // Get all HTML parts for this document
    const parts = await database.getAllHtmlParts(options.docid);

    if (parts.length === 0) {
      throw new Error(`No HTML parts found for document: ${options.docid}`);
    }

    // Start with main part '0', or use all parts in order
    let content: string;
    const mainPart = parts.find(p => p.partid === '0');

    if (mainPart) {
      content = mainPart.html;
    } else {
      console.warn(`⚠️ Main document part (partid='0') not found for docid: ${options.docid}, searching all parts`);
      content = parts.map(p => p.html).join('\n');
    }

    // Parse HTML and extract paragraphs
    const document = parseDocument(content, {
      withStartIndices: false,
      withEndIndices: false
    });

    let allParagraphs: Array<{ id: string | null, text: string }> = [];
    for (const child of document.children) {
      extractParagraphsWithIds(child, allParagraphs);
    }

    const ranges: FindRangeResult[] = [];
    let matchedIndices: number[] = [];

    // Perform matching based on match_type
    if (options.match_type === 'exact') {
      // Exact string match (case-insensitive)
      const lowerPattern = options.pattern.toLowerCase();
      matchedIndices = allParagraphs
        .map((p, i) => p.text.toLowerCase().includes(lowerPattern) ? i : -1)
        .filter(i => i !== -1);

    } else if (options.match_type === 'regex') {
      // Regular expression match
      try {
        const regex = new RegExp(options.pattern, 'i');
        matchedIndices = allParagraphs
          .map((p, i) => regex.test(p.text) ? i : -1)
          .filter(i => i !== -1);
      } catch (error) {
        throw new Error(`Invalid regex pattern: ${options.pattern}`);
      }

    } else if (options.match_type === 'semantic') {
      // Semantic match using embeddings
      if (!openaiClient) {
        throw new Error('OpenAI client required for semantic matching');
      }

      // Generate embedding for the pattern
      const patternEmbedding = await openaiClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: options.pattern
      });
      const patternVector = patternEmbedding.data[0].embedding;

      // Calculate similarity for each paragraph
      const similarities = await Promise.all(
        allParagraphs.map(async (p) => {
          if (!p.text) return 0;

          const paraEmbedding = await openaiClient.embeddings.create({
            model: 'text-embedding-3-small',
            input: p.text
          });
          const paraVector = paraEmbedding.data[0].embedding;

          // Cosine similarity
          let dotProduct = 0;
          let normA = 0;
          let normB = 0;
          for (let i = 0; i < patternVector.length; i++) {
            dotProduct += patternVector[i] * paraVector[i];
            normA += patternVector[i] * patternVector[i];
            normB += paraVector[i] * paraVector[i];
          }
          return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        })
      );

      // Select paragraphs with similarity > 0.7
      matchedIndices = similarities
        .map((sim, i) => sim > 0.7 ? i : -1)
        .filter(i => i !== -1);
    }

    // Group consecutive matches into ranges with context
    if (matchedIndices.length > 0) {
      let rangeStart = matchedIndices[0];
      let rangeEnd = matchedIndices[0];

      for (let i = 1; i <= matchedIndices.length; i++) {
        const currentIndex = matchedIndices[i];

        // Check if we should extend current range or start new one
        if (i < matchedIndices.length && currentIndex - rangeEnd <= contextLines * 2 + 1) {
          rangeEnd = currentIndex;
        } else {
          // Finalize current range
          const startIdx = Math.max(0, rangeStart - contextLines);
          const endIdx = Math.min(allParagraphs.length - 1, rangeEnd + contextLines);

          const rangeParagraphs = allParagraphs.slice(startIdx, endIdx + 1);
          const paragraphsWithIds = rangeParagraphs.filter(p => p.id !== null);

          ranges.push({
            range_id: make31BitId(),
            start_id: paragraphsWithIds[0]?.id || null,
            end_id: paragraphsWithIds[paragraphsWithIds.length - 1]?.id || null,
            paragraph_count: rangeParagraphs.length,
            preview: rangeParagraphs.map(p => p.text).join(' ').substring(0, 200) + '...'
          });

          // Start new range
          if (i < matchedIndices.length) {
            rangeStart = currentIndex;
            rangeEnd = currentIndex;
          }
        }
      }
    }

    return {
      document: options.docid,
      pattern: options.pattern,
      match_type: options.match_type,
      ranges_found: ranges.length,
      ranges: ranges
    };

  } catch (error: any) {
    throw error;
  }
}