import { Database } from './database.js';
import * as fs from 'fs/promises';
import OpenAI from 'openai';
import * as path from 'path';
import { generateEmbedding } from './openai-client.js';
import { findRanges as findRangesStandalone } from './findRange.js';
import { getInstructions } from './instructions.js';
import { getContext, setContext } from './context.js';
import { getContentRange } from './contentrange.js';
import { ContentBuffer, loadAsset, storeAsset } from './asset.js';

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
      description: 'Load stored asset by context terms (keyword + optional semantic match).',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: "string", description: "kind of asset stored" },
          terms: {
            type: 'array',
            items: { type: 'string' },
            description: 'Context words/phrases to match (no filenames).'
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
      name: 'get_context',
      description: 'Get context information based on terms like last_file_name, last_range, current_document, etc.',
      parameters: {
        type: 'object',
        properties: {
          terms: {
            type: 'array',
            items: { type: 'string' },
            description: 'Terms to get context for (e.g., ["last_file_name"], ["last_range"], ["current_document"])'
          }
        },
        required: ['terms']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_context',
      description: 'Set context value based on terms. The terms will be used to look up the context name, then store the value.',
      parameters: {
        type: 'object',
        properties: {
          terms: {
            type: 'array',
            items: { type: 'string' },
            description: 'Terms to identify which context to set (e.g., ["document_name"], ["current_file"])'
          },
          value: {
            type: 'string',
            description: 'The value to store in the context'
          }
        },
        required: ['terms', 'value']
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
  },
  {
    type: 'function' as const,
    function: {
      name: 'store_history',
      description: 'Store work history with current prompt and summary of work performed',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Summary of work performed in this session' }
        },
        required: ['summary']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'load_history',
      description: 'Load recent work history entries',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Number of history entries to retrieve (default: 10, max: 50)', minimum: 1, maximum: 50 }
        },
        additionalProperties: false
      }
    }
  }
];

export class MCPLocalClient {
  private database: Database;
  private openaiClient: OpenAI;
  private currentPrompt: string = '';

  // Buffer for chunked content
  private contentBuffer: ContentBuffer = new Map();

  constructor(database: Database, openaiClient: OpenAI) {
    this.database = database;
    this.openaiClient = openaiClient;
  }

  async executeTool(toolCall: MCPToolCall): Promise<string> {
    switch (toolCall.name) {
      case 'get_instructions':
        return await getInstructions(this.database, this.openaiClient, toolCall.arguments);

      case 'get_contentrange':
        return await getContentRange(toolCall.arguments);

      case 'store_asset':
        return await storeAsset(this.database, this.openaiClient, this.contentBuffer, toolCall.arguments);

      case 'load_asset':
        return await loadAsset(this.database, this.openaiClient, toolCall.arguments);

      case 'find_ranges':
        return await this.findRanges(toolCall.arguments);

      case 'get_context':
        return await getContext(this.database, this.openaiClient, toolCall.arguments);

      case 'set_context':
        return await setContext(this.database, this.openaiClient, toolCall.arguments);

      case 'find_file':
        return await this.findFile(toolCall.arguments);

      case 'store_history':
        return await this.storeHistory(toolCall.arguments);

      case 'load_history':
        return await this.loadHistory(toolCall.arguments);

      // case 'get_variable':
      //   return await this.loadHistory(toolCall.arguments);

      default:
        throw new Error(`Unknown tool: ${toolCall.name}`);
    }
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

  setCurrentPrompt(prompt: string): void {
    this.currentPrompt = prompt;
  }

  // private setCurrentRange(name: string, format: string, start_para?: string, end_para?: string, start_line?: number, end_line?: number): void {
  //   this.currentRange = {
  //     name,
  //     format,
  //     start_para,
  //     end_para,
  //     start_line,
  //     end_line
  //   };
  // }

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

  private async storeHistory(args: { summary: string }): Promise<string> {
    try {
      await this.database.storeHistory(this.currentPrompt, args.summary);

      console.log(`📝 Stored history entry: prompt="${this.currentPrompt.substring(0, 50)}..." summary="${args.summary.substring(0, 50)}..."`);

      return JSON.stringify({
        success: true,
        message: 'History entry stored successfully',
        prompt: this.currentPrompt,
        summary: args.summary,
        timestamp: new Date().toISOString()
      }, null, 2);
    } catch (error: any) {
      console.error('❌ Error storing history:', error);
      return JSON.stringify({
        success: false,
        error: error.message
      }, null, 2);
    }
  }

  private async loadHistory(args: { limit?: number }): Promise<string> {
    try {
      const limit = Math.min(args.limit || 10, 50); // Default 10, max 50
      const historyEntries = await this.database.getHistory(limit);

      console.log(`📖 Retrieved ${historyEntries.length} history entries`);

      return JSON.stringify({
        success: true,
        count: historyEntries.length,
        limit: limit,
        entries: historyEntries
      }, null, 2);
    } catch (error: any) {
      console.error('❌ Error loading history:', error);
      return JSON.stringify({
        success: false,
        error: error.message,
        count: 0,
        entries: []
      }, null, 2);
    }
  }
}