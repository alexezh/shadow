import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Database } from './database.js';
import { OpenAIClient } from './openai-client.js';

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
        
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async handleGetInstructions(args: { terms: string[] }) {
    try {
      const instructions = await this.openaiClient.generateInstructions(args.terms);
      
      return {
        content: [
          {
            type: 'text',
            text: instructions
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to generate instructions: ${error}`);
    }
  }

  private async handleStoreData(args: { terms: string[], text: string }) {
    try {
      const embedding = await this.openaiClient.generateEmbedding(args.text);
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