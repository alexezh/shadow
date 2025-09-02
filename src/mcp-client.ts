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

  private async storeAsset(args: { terms: string[]; text: string }): Promise<string> {
    const embedding = await generateEmbedding(this.openaiClient, args.terms);
    await this.database.storeAsset(args.terms, args.text, embedding);

    return `Successfully stored text for terms: ${args.terms.join(', ')}`;
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