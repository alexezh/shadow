import { mcpTools } from "./mcptools.js";
import { OpenAIClient, ConversationState } from "./openai-client.js";
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { SessionImpl } from './clippy/sessionimpl.js';
import { makeDefaultDoc } from './clippy/loaddoc.js';
import { loadHtml } from './om/loadHtml.js';

/*
  get document text
  extract default formatting
  default paragraph - 80%
  default table
  get format??? keep of remake??
  i know if a user changed after rewrite; so we can change the rule
  need json file for simplicity

  how to handle small variations of layout. === treat the same 
  6 columns vs 7 columns - question is what 
*/

export async function importBlueprint(filename: string, openaiClient: OpenAIClient): Promise<void> {
  try {
    console.log(`🔄 Importing document: ${filename}`);

    // Load the HTML file
    const contentDir = path.join(process.cwd(), 'content');
    const htmlFilePath = path.join(contentDir, filename);

    if (!fs.existsSync(htmlFilePath)) {
      console.error(`❌ File not found: ${htmlFilePath}`);
      return;
    }

    const htmlContent = fs.readFileSync(htmlFilePath, 'utf-8');

    // Create a temporary session with the document loaded
    const doc = makeDefaultDoc();
    const rootNode = loadHtml(htmlContent);

    // Clear default content and add loaded content
    const body = doc.getBody();
    while (body.getChildren().length > 0) {
      body.removeChild(0);
    }

    if (rootNode.hasChildren()) {
      for (const child of rootNode.getChildren()!) {
        body.addChild(child);
      }
    } else {
      body.addChild(rootNode);
    }

    const session = new SessionImpl(filename, doc);

    const systemPrompt = `You are Shadow, a word processing software agent responsible for working with documents.

-read document text using get_contentrange(format=html) API. Assume that user specified file name in a prompt.
-compute semantical structure of the document
   * Example. If document is a resume which contains person name, address and other info, output as
        document type - resume, person: tonnie, address: xyz, content and other semantical blocks
   * include start and stop paragraph id in markdown at the end of semantic block name using {startId:<id>, endId:<id>} syntax
   * store semantical structure as markdown using store_asset(kind="semantic")

-compute layout and formatting of the document as markdown focusing how different semantic elements are formatted
  * output your data in chunks of max 1500 tokens
  * store each chunk store_asset(kind="blueprint", chunkId=N).
  * include both formatting and layout information; such as title: orginized in table with top row containing xyz
  * example. if text is section header and formatted as 24Pt font, output section.header - font: 24Pt, textcolor: blue.
  * when storing blueprint, add terms describing type of documents this blueprint can be used for. Include short description of layout as one of terms.`;

    //   const foo = `-make a map of html ids to semantic
    // * format is "id1: semantic\nid2:semantic\n"
    // * output your data in chunks of max 1500 tokens
    // * store each chunk store_asset(kind="blueprint", chunkId=N).
    // * if there are multiple entities such as person, use 1,2,3 to disambiguate
    // * Example, if html contains <p id="3442">Fred</p><p id="57">1st ave</p> where 1st ave is an address, output 3442: person.name; 57: person.address
    // * If a document contains tables, provide semantic for every row and cell. For rows, provide aggregative semantic across cells, such as order.item or experience.item.
    // * Specify semantic information as category.subcategory.subsubcategory.etc. Do not include actual content.`;

    const userMessage = `Produce blueprint and semantic map for document "${filename}"`;

    const conversationState = new ConversationState(systemPrompt, userMessage);
    const result = await openaiClient.chatWithMCPTools(session, mcpTools, conversationState, userMessage);
    const response = result.response;
    console.log('🤖 Shadow:', response);

  } catch (error) {
    console.error('❌ Error importing document:', error);
  }
}

export interface SemanticMapping {
  startId: string;
  endId?: string; // Optional - if not provided, only startId element is replaced
  semantic: string;
}

export function processBlueprint(filename: string | undefined, semanticMap: string): string {
  if (!filename) {
    console.warn('⚠️  No filename provided for blueprint processing');
    return semanticMap;
  }

  try {
    // Load the HTML file
    const contentDir = path.join(process.cwd(), 'content');
    const htmlFilePath = path.join(contentDir, filename);

    if (!fs.existsSync(htmlFilePath)) {
      console.warn(`⚠️  HTML file not found: ${htmlFilePath}`);
      return semanticMap;
    }

    const htmlContent = fs.readFileSync(htmlFilePath, 'utf-8');

    // Parse the semantic mapping
    const mappings = parseSemanticMappings(semanticMap);

    if (mappings.length === 0) {
      console.warn('⚠️  No valid semantic mappings found');
      return htmlContent;
    }

    // Apply semantic attributes to HTML
    const processedHtml = addSemantic(htmlContent, mappings);

    console.log(`✅ Blueprint processed: ${mappings.length} mappings applied to ${filename}`);
    return processedHtml;

  } catch (error) {
    console.error(`❌ Error processing blueprint for ${filename}:`, error);
    return semanticMap; // Return original content on error
  }
}

function replaceHtmlWithSemantics(html: string, mappings: SemanticMapping[]): string {
  const $ = cheerio.load(html);

  // Debug: Log all IDs found in the document
  // const allIds: string[] = [];
  // $('[id]').each((index, element) => {
  //   allIds.push($(element).attr('id') || '');
  // });
  // console.log(`🔍 Debug: Found ${allIds.length} elements with IDs in HTML: ${allIds.slice(0, 10).join(', ')}${allIds.length > 10 ? '...' : ''}`);

  // Sort mappings by range size (larger ranges first) to avoid conflicts
  const sortedMappings = mappings.sort((a, b) => {
    if (!a.endId && !b.endId) return 0;
    if (!a.endId) return 1;
    if (!b.endId) return -1;

    // For ranges, process longer ranges first
    const aStart = $(`#${a.startId}`);
    const aEnd = $(`#${a.endId}`);
    const bStart = $(`#${b.startId}`);
    const bEnd = $(`#${b.endId}`);

    const aRange = aEnd.index() - aStart.index();
    const bRange = bEnd.index() - bStart.index();

    return bRange - aRange;
  });

  for (const mapping of sortedMappings) {
    console.log(`🔍 Debug: Looking for element with id '${mapping.startId}'`);
    const startElement = $(`#${mapping.startId}`);

    if (startElement.length === 0) {
      // Try to find if similar IDs exist
      //const similarIds = allIds.filter(id => id.includes(mapping.startId.substring(0, 4)));
      //console.warn(`⚠️  Element with id '${mapping.startId}' not found. Similar IDs: ${similarIds.join(', ')}`);
      console.warn(`⚠️  End element with id '${mapping.startId}' not found`);
      continue;
    }

    if (!mapping.endId) {
      // Single element replacement
      startElement.html(`{{${mapping.semantic}}}`);
      console.log(`🔄 Replaced element #${mapping.startId} with {{${mapping.semantic}}}`);
    } else {
      // Range replacement
      const endElement = $(`#${mapping.endId}`);

      if (endElement.length === 0) {
        console.warn(`⚠️  End element with id '${mapping.endId}' not found`);
        continue;
      }

      // Get all elements between start and end (inclusive)
      const elementsInRange: cheerio.Cheerio<any>[] = [];
      let current = startElement;

      elementsInRange.push(current);

      // Find all elements between start and end
      while (current.length > 0 && !current.is(`#${mapping.endId}`)) {
        current = current.next();
        if (current.length > 0) {
          elementsInRange.push(current);
        }
      }

      // Replace the content of the range
      if (elementsInRange.length > 0) {
        // Clear all elements in range except the first
        for (let i = 1; i < elementsInRange.length; i++) {
          elementsInRange[i].remove();
        }

        // Replace the first element's content with the semantic placeholder
        startElement.html(`{{${mapping.semantic}}}`);
        console.log(`🔄 Replaced range #${mapping.startId} to #${mapping.endId} with {{${mapping.semantic}}}`);
      }
    }
  }

  return $.html();
}

function addSemantic(html: string, mappings: SemanticMapping[]): string {
  const $ = cheerio.load(html);

  for (const mapping of mappings) {
    console.log(`🔍 Adding semantic attribute for element with id '${mapping.startId}'`);
    const startElement = $(`#${mapping.startId}`);

    if (startElement.length === 0) {
      console.warn(`⚠️  Element with id '${mapping.startId}' not found`);
      continue;
    }

    if (!mapping.endId) {
      // Single element - add data-semantic attribute
      startElement.attr('data-semantic', mapping.semantic);
      console.log(`🔄 Added data-semantic="${mapping.semantic}" to element #${mapping.startId}`);
    } else {
      // Range - add data-semantic attribute to all elements in range
      const endElement = $(`#${mapping.endId}`);

      if (endElement.length === 0) {
        console.warn(`⚠️  End element with id '${mapping.endId}' not found`);
        continue;
      }

      // Get all elements between start and end (inclusive)
      let current = startElement;
      let elementCount = 0;

      // Add attribute to start element
      current.attr('data-semantic', mapping.semantic);
      elementCount++;

      // Find all elements between start and end
      while (current.length > 0 && !current.is(`#${mapping.endId}`)) {
        current = current.next();
        if (current.length > 0) {
          current.attr('data-semantic', mapping.semantic);
          elementCount++;
        }
      }

      console.log(`🔄 Added data-semantic="${mapping.semantic}" to ${elementCount} elements in range #${mapping.startId} to #${mapping.endId}`);
    }
  }

  return $.html();
}

// Utility function to parse semantic mapping from string format
export function parseSemanticMappings(mappingText: string): SemanticMapping[] {
  const mappings: SemanticMapping[] = [];
  const lines = mappingText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  for (const line of lines) {
    // Parse formats like:
    // "z9f4k2m1: person.name"
    // "z9f4k2m1-abc123xy: person.address"
    // "- j6i28x04: person.name" (with leading dash)
    const match = line.match(/^-?\s*([a-z0-9]+)(?:-([a-z0-9]+))?\s*:\s*(.+)$/);

    if (match) {
      const [, startId, endId, semantic] = match;
      mappings.push({
        startId,
        endId: endId || undefined,
        semantic: semantic.trim()
      });
    } else {
      console.warn(`⚠️  Invalid semantic mapping format: ${line}`);
    }
  }

  return mappings;
}
