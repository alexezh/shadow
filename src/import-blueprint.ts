import { mcpTools } from "./mcp-client.js";
import { OpenAIClient } from "./openai-client.js";
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

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

    const systemPrompt = `You are Shadow, a word processing software agent responsible for working with documents.

-read document text using get_contentrange method. Use 'html' as format. Assume that user specified file name in a prompt.
-compute semantical structure of the document
   * Example. If document is a resume which contains person name, address and other info, output
     such as document type - resume, person: tonnie, address: xyz, content and other semantical blocks 
   * store semantical structure as markdown using store_asset(kind="semantic")
-make a map of html ids to semantic
  * output your data in chunks of max 1500 tokens
  * store each chunk store_asset(kind="blueprint", chunkId=N).
  * if there are multiple entities such as person, use 1,2,3 to disambiguate
  * Example, if html contains <p id="3442">Fred</p><p id="57">1st ave</p> where 1st ave is an address, output 3442: person.name; 57: person.address
  * if semantic element spans multiple html elements, use idStart-idEnd: semantic format. Such as 3442-7733: person.address

The user wants to import: ${filename}`;

    const userMessage = `Import document blueprint "${filename}" into the document library`;

    const response = await openaiClient.chatWithMCPTools(mcpTools, systemPrompt, userMessage);
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

    // Apply semantic replacements to HTML
    const processedHtml = replaceHtmlWithSemantics(htmlContent, mappings);
    
    console.log(`✅ Blueprint processed: ${mappings.length} mappings applied to ${filename}`);
    return processedHtml;
    
  } catch (error) {
    console.error(`❌ Error processing blueprint for ${filename}:`, error);
    return semanticMap; // Return original content on error
  }
}

function replaceHtmlWithSemantics(html: string, mappings: SemanticMapping[]): string {
  const $ = cheerio.load(html);

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
    const startElement = $(`#${mapping.startId}`);

    if (startElement.length === 0) {
      console.warn(`⚠️  Element with id '${mapping.startId}' not found`);
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

// Utility function to parse semantic mapping from string format
export function parseSemanticMappings(mappingText: string): SemanticMapping[] {
  const mappings: SemanticMapping[] = [];
  const lines = mappingText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  for (const line of lines) {
    // Parse formats like:
    // "abc123: person.name"
    // "abc123-xyz789: person.address" 
    const match = line.match(/^([a-zA-Z0-9]+)(?:-([a-zA-Z0-9]+))?\s*:\s*(.+)$/);

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
