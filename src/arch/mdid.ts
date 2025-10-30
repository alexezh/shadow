#!/usr/bin/env node

import * as fs from 'fs/promises';
import * as path from 'path';
import { make31BitId } from '../om/make31bitid';

function addIdsToMarkdown(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if line is not empty and doesn't already have an ID
    if (line.trim() && !line.includes('{id=')) {
      const trimmedLine = line.trim();

      // Skip only code blocks, blockquotes, and horizontal rules
      const isCodeBlock = trimmedLine.startsWith('```');
      const isBlockquote = trimmedLine.startsWith('>');
      const isHorizontalRule = /^[-*_]{3,}$/.test(trimmedLine);

      if (!isCodeBlock && !isBlockquote && !isHorizontalRule) {
        // Add ID at the end of the line (including headers, lists, and paragraphs)
        const id = make31BitId();
        result.push(`${line} {id=${id}}`);
      } else {
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

async function processMarkdownFile(filePath: string): Promise<void> {
  try {
    // Read the file
    const content = await fs.readFile(filePath, 'utf-8');

    // Process the content
    const processedContent = addIdsToMarkdown(content);

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
    console.log('Usage: npx ts-node src/mdid.ts <markdown-file>');
    console.log('       node dist/mdid.js <markdown-file>');
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

  // Check if file has .md extension
  if (!filePath.endsWith('.md')) {
    console.error(`❌ File must have .md extension: ${filePath}`);
    process.exit(1);
  }

  await processMarkdownFile(filePath);
}

// Run the script if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

export { addIdsToMarkdown, make31BitId };