import { OpenAIClient } from './openai-client.js';
import * as cheerio from 'cheerio';
import * as fs from 'fs/promises';
import * as path from 'path';

function generateAlphanumericId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function addIdsToAllElements(html: string): Promise<string> {
  const $ = cheerio.load(html);

  // Add IDs to all elements that don't already have them
  $('*').each((index, element) => {
    const $element = $(element);
    if (!$element.attr('id')) {
      $element.attr('id', generateAlphanumericId());
    }
  });

  return $.html();
}

async function getUniqueFilename(baseDir: string, filename: string): Promise<string> {
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext);
  let counter = 0;
  let finalFilename = filename;

  while (true) {
    const fullPath = path.join(baseDir, finalFilename);
    try {
      await fs.access(fullPath);
      // File exists, try next index
      counter++;
      finalFilename = `${baseName}_${counter}${ext}`;
    } catch {
      // File doesn't exist, we can use this name
      break;
    }
  }

  return finalFilename;
}

export async function makeSample(openaiClient: OpenAIClient, userRequest: string): Promise<string> {
  try {
    console.log(`🔄 Generating HTML sample for: ${userRequest}`);

    const systemPrompt = `You are Shadow, a word processing software agent responsible for working with documents.

Generate HTML content based on the user's request. Follow these guidelines:
- Create clean, semantic HTML
- Include appropriate structure (headings, paragraphs, tables, lists, etc.)
- Make the content realistic and representative of what the user asked for
- Do NOT include <html>, <head>, or <body> tags - just the content elements
- At the end of your response, suggest a filename for this HTML in the format: FILENAME: suggested_name.html

The HTML should be complete and ready to use as sample content.`;

    const userPrompt = `Create HTML content for: ${userRequest}

Please generate appropriate HTML elements and suggest a filename.`;

    const { response, conversationId } = await openaiClient.chatWithMCPTools([], systemPrompt, userPrompt, {
      requireEnvelope: false
    });
    openaiClient.clearConversation(conversationId);

    // Extract filename from response
    const filenameMatch = response.match(/FILENAME:\s*(.+\.html)/i);
    let suggestedFilename = 'sample.html';
    if (filenameMatch) {
      suggestedFilename = filenameMatch[1].trim();
    }

    // Extract HTML content (everything before the FILENAME line)
    let htmlContent = response;
    if (filenameMatch) {
      htmlContent = response.substring(0, response.lastIndexOf('FILENAME:')).trim();
    }

    // Clean up any markdown code blocks if present
    htmlContent = htmlContent.replace(/```html\s*/g, '').replace(/```\s*$/g, '').trim();

    console.log(`📝 Generated HTML content (${htmlContent.length} chars) with suggested filename: ${suggestedFilename}`);

    // Add IDs to all elements
    const htmlWithIds = await addIdsToAllElements(htmlContent);
    console.log(`🔢 Added random IDs to all HTML elements`);

    // Ensure content directory exists
    const contentDir = path.join(process.cwd(), 'content');
    await fs.mkdir(contentDir, { recursive: true });

    // Get unique filename
    const uniqueFilename = await getUniqueFilename(contentDir, suggestedFilename);
    const fullPath = path.join(contentDir, uniqueFilename);

    // Write to file
    await fs.writeFile(fullPath, htmlWithIds, 'utf-8');

    console.log(`✅ Sample HTML saved to: ${fullPath}`);
    return `Successfully created sample HTML file: ${uniqueFilename}`;

  } catch (error) {
    console.error('❌ Error creating sample HTML:', error);
    throw new Error(`Failed to create sample HTML: ${error}`);
  }
}
