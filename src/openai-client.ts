import OpenAI from 'openai';
import { MCPLocalClient } from './mcp-client.js';
import { Database } from './database.js';

export async function generateEmbedding(client: OpenAI, terms: string[]): Promise<number[]> {
  const termsText = terms.join(' ');
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: termsText
  });

  return response.data[0]?.embedding || [];
}

export class OpenAIClient {
  private client: OpenAI;
  private mcpClient: MCPLocalClient;

  constructor(database: Database, apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY
    });
    this.mcpClient = new MCPLocalClient(database, this.client);
  }

  async generateInstructions(terms: string[]): Promise<string> {
    const prompt = `Generate detailed instructions for the following terms: ${terms.join(', ')}`;

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are Shadow, a word processing software agent responsible for working with documents.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    return response.choices[0]?.message?.content || '';
  }

  async generateEmbedding(terms: string[]): Promise<number[]> {
    return generateEmbedding(this.client, terms)
  }

  async chatWithMCPTools(systemPrompt: string, userMessage: string): Promise<string> {
    // Define MCP tools configuration for OpenAI function calling
    const mcpTools = [
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
          description: 'Read range of document content',
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
          description: 'Store text data with embeddings',
          parameters: {
            type: 'object',
            properties: {
              terms: {
                type: 'array',
                items: { type: 'string' },
                description: 'Terms associated with the text'
              },
              text: { type: 'string', description: 'Text content to store' }
            },
            required: ['terms', 'text']
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
      }
    ];

    let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    // Loop to handle multiple function calls
    let maxIterations = 5;
    let iteration = 0;

    while (iteration < maxIterations) {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools: mcpTools,
        tool_choice: 'auto',
        max_tokens: 1500,
        temperature: 0.7
      });

      const choice = response.choices[0];
      if (!choice?.message) break;

      messages.push(choice.message);

      // If no tool calls, we're done
      if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
        return choice.message.content || '';
      }

      // Execute tool calls
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type === 'function') {
          try {
            const functionArgs = JSON.parse(toolCall.function.arguments);
            const result = await this.mcpClient.executeTool({
              name: toolCall.function.name,
              arguments: functionArgs
            });

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result
            });
          } catch (error) {
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Error executing ${toolCall.function.name}: ${error}`
            });
          }
        }
      }

      iteration++;
    }

    return 'Max iterations reached without final response';
  }
}