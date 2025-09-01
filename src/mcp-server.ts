import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Database } from './database.js';
import { OpenAIClient } from './openai-client.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class MCPServer {
  private server: Server;
  private database: Database;
  private openaiClient: OpenAIClient;

  constructor() {
    this.server = new Server(
      {
        name: 'openai-mcp-service',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.database = new Database();
    this.openaiClient = new OpenAIClient();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_instructions',
          description: 'Generate instructions based on a list of terms',
          inputSchema: {
            type: 'object',
            properties: {
              terms: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of terms to generate instructions for'
              }
            },
            required: ['terms']
          }
        },
        {
          name: 'store_data',
          description: 'Store text data with embeddings based on terms',
          inputSchema: {
            type: 'object',
            properties: {
              terms: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of terms associated with the text'
              },
              text: {
                type: 'string',
                description: 'Text content to store'
              }
            },
            required: ['terms', 'text']
          }
        },
        {
          name: 'load_data',
          description: 'Load text data based on terms',
          inputSchema: {
            type: 'object',
            properties: {
              terms: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of terms to search for'
              }
            },
            required: ['terms']
          }
        },
        {
          name: 'get_contentrange',
          description: 'Read range of document content from the content directory',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Document name (without extension)'
              },
              format: {
                type: 'string',
                enum: ['text', 'html'],
                description: 'Format of the document to read'
              },
              start_para: {
                type: 'string',
                description: 'ID of starting paragraph (optional, defaults to first paragraph)'
              },
              end_para: {
                type: 'string',
                description: 'ID of ending paragraph (optional, defaults to last paragraph)'
              }
            },
            required: ['name', 'format']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'get_instructions':
          return await this.handleGetInstructions(args as { terms: string[] });

        case 'store_data':
          return await this.handleStoreData(args as { terms: string[], text: string });

        case 'load_data':
          return await this.handleLoadData(args as { terms: string[] });

        case 'get_contentrange':
          return await this.handleGetContentRange(args as { name: string, format: string, start_para?: string, end_para?: string });

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async handleGetInstructions(args: { terms: string[] }) {
    try {
      const texts = await this.database.getAllTextsForTerms(args.terms);

      if (texts.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No instructions found for terms: ${args.terms.join(', ')}`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: texts.join('\n\n')
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get instructions: ${error}`);
    }
  }

  private async handleStoreData(args: { terms: string[], text: string }) {
    try {
      const embedding = await this.openaiClient.generateEmbedding(args.terms);
      await this.database.storeEmbedding(args.terms, args.text, embedding);

      return {
        content: [
          {
            type: 'text',
            text: `Successfully stored text with ${embedding.length} dimensions for terms: ${args.terms.join(', ')}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to store data: ${error}`);
    }
  }

  private async handleLoadData(args: { terms: string[] }) {
    try {
      const texts = await this.database.getAllTextsForTerms(args.terms);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              terms: args.terms,
              texts: texts,
              count: texts.length
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to load data: ${error}`);
    }
  }

  private async handleGetContentRange(args: { name: string, format: string, start_para?: string, end_para?: string }) {
    try {
      const contentDir = path.join(process.cwd(), 'content');
      const extension = args.format === 'html' ? 'html' : 'txt';
      const filePath = path.join(contentDir, `${args.name}.${extension}`);

      try {
        const content = await fs.readFile(filePath, 'utf-8');

        // If no range specified, return full content
        if (!args.start_para && !args.end_para) {
          return {
            content: [
              {
                type: 'text',
                text: content
              }
            ]
          };
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
        const rangeContent = rangeLines.join('\n');
        
        return {
          content: [
            {
              type: 'text',
              text: rangeContent
            }
          ]
        };
      } catch (fileError: any) {
        if (fileError.code === 'ENOENT') {
          return {
            content: [
              {
                type: 'text',
                text: `Document '${args.name}.${extension}' not found in content directory`
              }
            ]
          };
        }
        throw fileError;
      }
    } catch (error) {
      throw new Error(`Failed to read content range: ${error}`);
    }
  }

  async start(): Promise<void> {
    await this.database.initialize();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('OpenAI MCP Service started');
  }

  async stop(): Promise<void> {
    await this.database.close();
  }
}