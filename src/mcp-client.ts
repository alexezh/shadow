import { Database } from './database.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface MCPToolCall {
  name: string;
  arguments: any;
}

export class MCPLocalClient {
  private database: Database;

  constructor(database: Database) {
    this.database = database;
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
      
      default:
        throw new Error(`Unknown tool: ${toolCall.name}`);
    }
  }

  private async getInstructions(args: { terms: string[] }): Promise<string> {
    const texts = await this.database.getAllTextsForTerms(args.terms);
    
    if (texts.length === 0) {
      return `No instructions found for terms: ${args.terms.join(', ')}`;
    }
    
    return texts.join('\n\n');
  }

  private async getContentRange(args: { 
    name: string; 
    format: string; 
    start_para?: string; 
    end_para?: string; 
  }): Promise<string> {
    const contentDir = path.join(process.cwd(), 'content');
    const extension = args.format === 'html' ? 'html' : 'txt';
    const filePath = path.join(contentDir, `${args.name}.${extension}`);
    
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
      return rangeLines.join('\n');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return `Document '${args.name}.${extension}' not found in content directory`;
      }
      throw error;
    }
  }

  private async storeAsset(args: { terms: string[]; text: string }): Promise<string> {
    // For now, just use a simple embedding (in real implementation, would call OpenAI)
    const mockEmbedding = new Array(1536).fill(0).map(() => Math.random());
    await this.database.storeEmbedding(args.terms, args.text, mockEmbedding);
    
    return `Successfully stored text for terms: ${args.terms.join(', ')}`;
  }

  private async loadAsset(args: { terms: string[] }): Promise<string> {
    const texts = await this.database.getAllTextsForTerms(args.terms);
    
    return JSON.stringify({
      terms: args.terms,
      texts: texts,
      count: texts.length
    }, null, 2);
  }
}