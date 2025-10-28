import { Database } from './database.js';
import * as fs from 'fs/promises';
import OpenAI from 'openai';
import * as path from 'path';
import { generateEmbedding } from './openai-client.js';
import { findRanges as findRangesStandalone } from './skills/findRange.js';
import { formatRange as formatRangeStandalone, cacheRange } from './skills/formatRange.js';
import { getSkills } from "./skills/getSkills.js";
import { getContext, setContext } from './skills/context.js';
import { getContentRange } from './om/getContentRange.js';
import { ContentBuffer, loadAsset, storeAsset } from './asset.js';
import { make31BitId } from './make31bitid.js';
import { documentCreate, loadHtmlPart, storeHtmlPart } from './htmlparts.js';
import { Session } from './clippy/session.js';

export interface MCPToolCall {
  name: string;
  arguments: any;
}

export class ToolDispatcher {
  private database: Database;
  private openaiClient: OpenAI;
  private currentPrompt: string = '';

  // Buffer for chunked content
  private contentBuffer: ContentBuffer = new Map();

  constructor(database: Database, openaiClient: OpenAI) {
    this.database = database;
    this.openaiClient = openaiClient;
  }

  async executeTool(session: Session, toolCall: MCPToolCall): Promise<string> {
    switch (toolCall.name) {
      case 'get_skills':
        return await getSkills(this.database, this.openaiClient, toolCall.arguments);

      case 'get_contentrange':
        return await getContentRange(session, toolCall.arguments);

      case 'store_asset':
        return await storeAsset(this.database, this.openaiClient, this.contentBuffer, toolCall.arguments);

      case 'load_asset':
        return await loadAsset(this.database, this.openaiClient, toolCall.arguments);

      case 'find_ranges':
        return await this.findRanges(toolCall.arguments);

      case 'format_range':
        return await this.formatRanges(toolCall.arguments);

      case 'get_dictionary':
        return await this.getDictionary(toolCall.arguments);

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

      case 'make_id':
        return make31BitId();

      case 'document_create':
        return await documentCreate(this.database, toolCall.arguments);

      case 'store_htmlpart':
        return await storeHtmlPart(this.database, toolCall.arguments);

      case 'load_htmlpart':
        return await loadHtmlPart(this.database, toolCall.arguments);

      // case 'get_variable':
      //   return await this.loadHistory(toolCall.arguments);

      default:
        throw new Error(`Unknown tool: ${toolCall.name}`);
    }
  }


  private async findRanges(args: {
    docid: string;
    pattern: string;
    match_type: 'exact' | 'regex' | 'semantic';
    context_lines?: number;
  }): Promise<string> {
    try {
      const result = await findRangesStandalone({
        docid: args.docid,
        pattern: args.pattern,
        match_type: args.match_type,
        context_lines: args.context_lines
      }, this.database, this.openaiClient);

      // Cache each range_id with its start_id and end_id
      for (const range of result.ranges) {
        cacheRange(range.range_id, range.start_id, range.end_id);
      }

      console.log(`🔍 Found ${result.ranges_found} ranges, cached ${result.ranges.length} range IDs`);

      return JSON.stringify(result, null, 2);
    } catch (error: any) {
      return JSON.stringify({
        document: args.docid,
        pattern: args.pattern,
        match_type: args.match_type,
        ranges_found: 0,
        ranges: [],
        error: error.message
      }, null, 2);
    }
  }

  private async formatRanges(args: {
    docid: string;
    ranges: Array<{
      range_id: string;
      properties: Array<{ prop: string; value: any }>;
    }>;
  }): Promise<string> {
    try {
      const result = await formatRangeStandalone({
        docid: args.docid,
        ranges: args.ranges
      }, this.database);

      return JSON.stringify(result, null, 2);
    } catch (error: any) {
      console.error('❌ Error formatting ranges:', error);
      return JSON.stringify({
        success: false,
        docid: args.docid,
        ranges_formatted: 0,
        ranges: [],
        error: error.message
      }, null, 2);
    }
  }

  private async getDictionary(args: { docid: string }): Promise<string> {
    try {
      // Get all HTML parts for the document
      const parts = await this.database.getAllHtmlParts(args.docid);

      if (parts.length === 0) {
        return JSON.stringify({
          success: false,
          docid: args.docid,
          word_count: 0,
          words: [],
          error: 'No HTML parts found for document'
        }, null, 2);
      }

      // Extract all words from all parts
      const wordSet = new Set<string>();

      for (const part of parts) {
        // Remove HTML tags and extract text
        const text = part.html.replace(/<[^>]*>/g, ' ');

        // Extract words (alphanumeric sequences)
        const words = text.match(/\b[a-zA-Z]+\b/g);

        if (words) {
          // Add each word to the set (lowercase for uniqueness)
          words.forEach(word => {
            if (word.length > 0) {
              wordSet.add(word.toLowerCase());
            }
          });
        }
      }

      // Convert set to sorted array
      const uniqueWords = Array.from(wordSet).sort();

      console.log(`📖 Extracted ${uniqueWords.length} unique words from document ${args.docid}`);

      return JSON.stringify({
        success: true,
        docid: args.docid,
        word_count: uniqueWords.length,
        words: uniqueWords
      }, null, 2);
    } catch (error: any) {
      console.error('❌ Error getting dictionary:', error);
      return JSON.stringify({
        success: false,
        docid: args.docid,
        word_count: 0,
        words: [],
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