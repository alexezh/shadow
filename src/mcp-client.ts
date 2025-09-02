import { Database } from './database.js';
import * as fs from 'fs/promises';
import OpenAI from 'openai';
import * as path from 'path';
import { generateEmbedding } from './openai-client.js';
import { findRanges as findRangesStandalone } from './findRange.js';

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
      description: 'Store JSON data with embeddings',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'name of the document asset is coming from' },
          terms: {
            type: 'array',
            items: { type: 'string' },
            description: 'Terms associated with the data'
          },
          start_para: { type: 'string' },
          end_para: { type: 'string' },
          content: { type: 'string', description: '' }
        },
        required: ['terms', 'data']
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

  private async storeAsset(args: { filename?: string; terms: string[]; data: any }): Promise<string> {
    const embedding = await generateEmbedding(this.openaiClient, args.terms);
    const jsonText = JSON.stringify(args, null, 2);
    await this.database.storeAsset(args.terms, jsonText, embedding, args.filename);

    return `Successfully stored JSON data for terms: ${args.terms.join(', ')}${args.filename ? ` from file: ${args.filename}` : ''}`;
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