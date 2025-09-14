import { Database } from './database.js';
import * as fs from 'fs/promises';
import OpenAI from 'openai';
import * as path from 'path';
import { generateEmbedding } from './openai-client.js';
import { findRanges as findRangesStandalone } from './findRange.js';
import { processBlueprint } from './import-blueprint.js';

export interface MCPToolCall {
  name: string;
  arguments: any;
}

// Define MCP tools configuration for OpenAI function calling
export const mcpTools = [
  {
    type: 'function' as const,
    function: {
      name: 'get_instructions',
      description: 'Get stored instructions for given terms',
      parameters: {
        type: 'object',
        properties: {
          terms: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of terms to get instructions for'
          }
        },
        required: ['terms']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_contentrange',
      description: 'Read range of document content. Omit start_para and end_para to read entire document from start to end',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Document name' },
          format: { type: 'string', enum: ['text', 'html'] },
          start_para: { type: 'string', description: 'Starting paragraph ID (optional)' },
          end_para: { type: 'string', description: 'Ending paragraph ID (optional)' }
        },
        required: ['name', 'format']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'store_asset',
      description: 'Store document data with embeddings. For large content, use chunking parameters.All chunks of the same document MUST share the same chunkId, and include chunkIndex and totalChunks.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: "string", description: "kind of asset stored" },
          filename: { type: 'string', description: 'name of the document asset is coming from' },
          terms: {
            type: 'array',
            items: { type: 'string' },
            description: 'Terms associated with the data'
          },
          start_para: { type: 'string' },
          end_para: { type: 'string' },
          content: { type: 'string', description: 'data to store' },

          // Chunking parameters
          chunkId: { type: 'string', description: 'Unique ID to group related chunks (required if chunked)' },
          chunkIndex: { type: 'integer', minimum: 0, description: 'Index of this chunk (0-based)' },
          totalChunks: { type: 'integer', minimum: 1, description: 'Total number of chunks in this asset' }
        },
        required: ['terms', 'content', 'chunkId', 'chunkIndex', 'totalChunks']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'load_asset',
      description: 'Load stored data by terms',
      parameters: {
        type: 'object',
        properties: {
          terms: {
            type: 'array',
            items: { type: 'string' },
            description: 'Terms to search for'
          }
        },
        required: ['terms']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_ranges',
      description: 'Find ranges in document that match one or more search terms',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Document name' },
          format: { type: 'string', enum: ['text', 'html'] },
          terms: {
            type: 'array',
            items: { type: 'string' },
            description: 'Terms to search for'
          },
          context_lines: {
            type: 'number',
            description: 'Number of context lines around matches (optional, default: 0)'
          }
        },
        required: ['name', 'format', 'terms']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_current_range',
      description: 'Get the current working range that was last accessed via get_contentrange or find_ranges',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_file',
      description: 'Find files in the content directory using glob patterns (* for any characters, ? for single character)',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'File pattern to search for (supports * and ? wildcards)' }
        },
        required: ['pattern']
      }
    }
  }
];

export type StoreAssetsArgs = {
  kind: string;
  filename?: string;
  terms: string[];
  content: any;
  chunkId?: string;
  chunkIndex?: number;
  totalChunks?: number;
}

export class MCPLocalClient {
  private database: Database;
  private openaiClient: OpenAI;
  private currentRange: {
    name: string;
    format: string;
    start_para?: string;
    end_para?: string;
    start_line?: number;
    end_line?: number;
  } | null = null;

  // Buffer for chunked content
  private contentBuffer: Map<string, {
    chunks: Array<{ chunkIndex: number; content: string; totalChunks: number }>;
    filename?: string;
    terms: string[];
    isComplete: boolean;
  }> = new Map();

  constructor(database: Database, openaiClient: OpenAI) {
    this.database = database;
    this.openaiClient = openaiClient;
  }

  async executeTool(toolCall: MCPToolCall): Promise<string> {
    switch (toolCall.name) {
      case 'get_instructions':
        return await this.getInstructions(toolCall.arguments);

      case 'get_contentrange':
        return await this.getContentRange(toolCall.arguments);

      case 'store_asset':
        return await this.storeAsset(toolCall.arguments);

      case 'load_asset':
        return await this.loadAsset(toolCall.arguments);

      case 'find_ranges':
        return await this.findRanges(toolCall.arguments);

      case 'get_current_range':
        return await this.getCurrentRange(toolCall.arguments);

      case 'find_file':
        return await this.findFile(toolCall.arguments);

      default:
        throw new Error(`Unknown tool: ${toolCall.name}`);
    }
  }

  private async getInstructions(args: { terms: string[] }): Promise<string> {
    const embedding = await generateEmbedding(this.openaiClient, args.terms);
    const texts = await this.database.getInstructions(embedding);

    if (texts.length === 0) {
      return `No instructions found for terms: ${args.terms.join(', ')}`;
    }

    return "\n[CONTEXT]\n" + texts.map(x => x.text).join('\n\n') + "\n[/CONTEXT]\n";
  }

  private async getContentRange(args: {
    name: string;
    format: string;
    start_para?: string;
    end_para?: string;
  }): Promise<string> {
    const contentDir = path.join(process.cwd(), 'content');
    const filePath = path.join(contentDir, `${args.name}`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // If no range specified, return full content
      if (!args.start_para && !args.end_para) {
        return content;
      }

      // Extract range based on paragraph IDs
      const lines = content.split('\n');
      let startIndex = 0;
      let endIndex = lines.length - 1;

      // Find start paragraph index
      if (args.start_para) {
        const startFound = lines.findIndex(line => line.includes(`{id=${args.start_para}}`));
        if (startFound !== -1) {
          startIndex = startFound;
        }
      }

      // Find end paragraph index
      if (args.end_para) {
        const endFound = lines.findIndex(line => line.includes(`{id=${args.end_para}}`));
        if (endFound !== -1) {
          endIndex = endFound;
        }
      }

      // Extract the range
      const rangeLines = lines.slice(startIndex, endIndex + 1);

      // Set current range for future reference
      this.setCurrentRange(args.name, args.format, args.start_para, args.end_para, startIndex, endIndex);

      return rangeLines.join('\n');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return `Document '${args.name}' not found in content directory`;
      }
      throw error;
    }
  }

  private async storeAsset(args: StoreAssetsArgs): Promise<string> {

    // Normalize non-chunked content to single chunk format
    if (args.chunkId === undefined || args.chunkIndex === undefined || args.totalChunks === undefined) {
      args.chunkId = `single_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      args.chunkIndex = 0;
      args.totalChunks = 1;
    }

    // Handle all content as chunks (unified logic)
    // Get or create buffer entry
    let bufferEntry = this.contentBuffer.get(args.chunkId);
    if (!bufferEntry) {
      bufferEntry = {
        chunks: [],
        filename: args.filename,
        terms: args.terms,
        isComplete: false
      };
      this.contentBuffer.set(args.chunkId, bufferEntry);
    }

    // Add this chunk
    bufferEntry.chunks.push({
      chunkIndex: args.chunkIndex,
      content: typeof args.content === 'string' ? args.content : JSON.stringify(args.content),
      totalChunks: args.totalChunks
    });

    console.log(`📦 Received chunk ${args.chunkIndex + 1}/${args.totalChunks} for ${args.chunkId} (${args.content.length} chars)`);

    // Check if we have all chunks
    if (bufferEntry.chunks.length !== args.totalChunks) {
      return `Chunk ${args.chunkIndex + 1}/${args.totalChunks} received for ${args.chunkId}. Waiting for remaining chunks.`;
    }

    // Sort chunks by index and combine
    bufferEntry.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    const completeContent = bufferEntry.chunks.map(chunk => chunk.content).join('');

    console.log(`✅ All chunks received for ${args.chunkId}. Total content: ${completeContent.length} chars`);

    // Update args with complete content for further processing
    const content = completeContent;

    // Clean up buffer
    this.contentBuffer.delete(args.chunkId);

    await this.processContent(args, content)
    const chunkInfo = args.totalChunks > 1 ? ` (${args.totalChunks} chunks)` : '';
    return `Successfully stored ${args.kind} data for terms: ${args.terms.join(', ')}${args.filename ? ` from file: ${args.filename}` : ''}${chunkInfo}`;
  }

  private async processContent(args: StoreAssetsArgs, content: string): Promise<void> {
    // Optionally write to file for special kinds (blueprint/semantic)
    if (args.filename && (args.kind === 'blueprint' || args.kind === 'semantic')) {
      await this.writeSpecialFiles(args);
    }

    if (args.kind === "blueprint") {
      content = processBlueprint(args.filename, content);
    }
    // Always store full content in database
    const embedding = await generateEmbedding(this.openaiClient, args.terms);
    const jsonText = JSON.stringify(args, null, 2);
    await this.database.storeAsset(args.terms, content, embedding, args.filename);
  }


  private async writeSpecialFiles(args: { kind?: string; filename?: string; terms: string[]; content: any }): Promise<void> {
    if (!args.filename) return;

    const contentDir = path.join(process.cwd(), 'content');
    const baseName = args.filename.replace(/\.[^.]+$/, ''); // Remove extension

    try {
      // Ensure content directory exists
      await fs.mkdir(contentDir, { recursive: true });

      if (args.kind === 'semantic') {
        // Write semantic data as markdown
        const semanticFile = path.join(contentDir, `${baseName}.semantic.md`);
        let semanticContent: string;

        if (typeof args.content === 'string') {
          semanticContent = args.content;
        } else if (args.content && typeof args.content === 'object') {
          // Pretty print JSON with proper formatting
          semanticContent = JSON.stringify(args.content, null, 2);
        } else {
          semanticContent = String(args.content || '');
        }

        console.log(`🔍 Debug: semantic content length before write: ${semanticContent.length}`);
        await fs.writeFile(semanticFile, semanticContent, { encoding: 'utf-8', flag: 'w' });

        // Verify the file was written correctly
        const writtenContent = await fs.readFile(semanticFile, 'utf-8');
        console.log(`📝 Wrote semantic data to: ${semanticFile} (wrote: ${semanticContent.length}, read back: ${writtenContent.length})`);

        if (writtenContent.length !== semanticContent.length) {
          console.error(`⚠️  File truncation detected! Expected ${semanticContent.length}, got ${writtenContent.length}`);
        }
      }

      if (args.kind === 'blueprint') {
        // Write blueprint data as HTML
        const blueprintFile = path.join(contentDir, `${baseName}.blueprint.html`);
        let blueprintContent: string;

        if (typeof args.content === 'string') {
          blueprintContent = args.content;
        } else if (args.content && typeof args.content === 'object') {
          // For blueprint, if it's an object, try to extract HTML content
          if (args.content.html || args.content.content) {
            blueprintContent = args.content.html || args.content.content;
          } else {
            blueprintContent = JSON.stringify(args.content, null, 2);
          }
        } else {
          blueprintContent = String(args.content || '');
        }

        console.log(`🔍 Debug: blueprint content length before write: ${blueprintContent.length}`);
        await fs.writeFile(blueprintFile, blueprintContent, { encoding: 'utf-8', flag: 'w' });

        // Verify the file was written correctly
        const writtenContent = await fs.readFile(blueprintFile, 'utf-8');
        console.log(`📝 Wrote blueprint data to: ${blueprintFile} (wrote: ${blueprintContent.length}, read back: ${writtenContent.length})`);

        if (writtenContent.length !== blueprintContent.length) {
          console.error(`⚠️  File truncation detected! Expected ${blueprintContent.length}, got ${writtenContent.length}`);
        }
      }
    } catch (error) {
      console.error('❌ Error writing special files:', error);
    }
  }

  private async loadAsset(args: { terms: string[] }): Promise<string> {
    const embedding = await generateEmbedding(this.openaiClient, args.terms);
    const texts = await this.database.getAssets(embedding);

    return JSON.stringify({
      terms: args.terms,
      texts: texts,
      count: texts.length
    }, null, 2);
  }

  private async findRanges(args: {
    name: string;
    format: string;
    terms: string[];
    context_lines?: number;
  }): Promise<string> {
    try {
      const result = await findRangesStandalone(args);
      return JSON.stringify(result, null, 2);
    } catch (error: any) {
      return JSON.stringify({
        document: args.name,
        format: args.format,
        search_terms: args.terms,
        ranges_found: 0,
        ranges: [],
        error: error.message
      }, null, 2);
    }
  }

  private async getCurrentRange(args: {}): Promise<string> {
    if (!this.currentRange) {
      return JSON.stringify({
        current_range: null,
        message: "No current range set. Use get_contentrange or find_ranges to set a working range."
      }, null, 2);
    }

    return JSON.stringify({
      current_range: this.currentRange,
      message: "Current range retrieved successfully"
    }, null, 2);
  }

  private setCurrentRange(name: string, format: string, start_para?: string, end_para?: string, start_line?: number, end_line?: number): void {
    this.currentRange = {
      name,
      format,
      start_para,
      end_para,
      start_line,
      end_line
    };
  }

  private async findFile(args: { pattern: string }): Promise<string> {
    const contentDir = path.join(process.cwd(), 'content');

    try {
      const files = await fs.readdir(contentDir);
      const matchingFiles = files.filter(file => {
        // Support glob-like patterns
        const regex = new RegExp(
          args.pattern
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.')
            .replace(/\[([^\]]+)\]/g, '[$1]'),
          'i'
        );
        return regex.test(file);
      });

      return JSON.stringify({
        pattern: args.pattern,
        directory: contentDir,
        files_found: matchingFiles.length,
        files: matchingFiles
      }, null, 2);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return JSON.stringify({
          pattern: args.pattern,
          directory: contentDir,
          error: 'Content directory not found',
          files_found: 0,
          files: []
        }, null, 2);
      }
      throw error;
    }
  }
}