import OpenAI from 'openai';
import { MCPLocalClient } from './mcp-client.js';
import { Database } from './database.js';
import { ChatCompletionTool } from 'openai/resources/index.js';

export async function generateEmbedding(client: OpenAI, terms: string | string[]): Promise<number[]> {
  let text = (Array.isArray(terms)) ? terms.join(' ') : terms;
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: terms
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

  // async generateInstructions(terms: string[]): Promise<string> {
  //   const prompt = `Generate detailed instructions for the following terms: ${terms.join(', ')}`;

  //   const response = await this.client.chat.completions.create({
  //     model: 'gpt-4o',
  //     messages: [
  //       {
  //         role: 'system',
  //         content: 'You are Shadow, a word processing software agent responsible for working with documents.'
  //       },
  //       {
  //         role: 'user',
  //         content: prompt
  //       }
  //     ],
  //     max_tokens: 1000,
  //     temperature: 0.7
  //   });

  //   return response.choices[0]?.message?.content || '';
  // }

  async generateEmbedding(terms: string | string[]): Promise<number[]> {
    return generateEmbedding(this.client, terms)
  }

  async chatWithMCPTools(mcpTools: Array<ChatCompletionTool>, systemPrompt: string, userMessage: string): Promise<string> {

    let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    // Loop to handle multiple function calls
    let maxIterations = 5;
    let iteration = 0;

    while (iteration < maxIterations) {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4.1',
        messages,
        tools: mcpTools,
        stream: true,
        tool_choice: 'auto',
        max_tokens: 1500,
        //max_completion_tokens: 1500,
        temperature: 0.7
      });

      let assistantMessage = {
        role: 'assistant' as const,
        content: '',
        tool_calls: [] as any[]
      };

      // Collect all streaming chunks
      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          assistantMessage.content += delta.content;
        }

        if (delta?.tool_calls) {
          // Handle streaming tool calls
          for (const toolCall of delta.tool_calls) {
            if (toolCall.index !== undefined) {
              // Initialize tool call if it doesn't exist
              if (!assistantMessage.tool_calls[toolCall.index]) {
                assistantMessage.tool_calls[toolCall.index] = {
                  id: toolCall.id || '',
                  type: 'function' as const,
                  function: {
                    name: toolCall.function?.name || '',
                    arguments: ''
                  }
                };
              }

              // Accumulate the function arguments
              if (toolCall.function?.arguments) {
                assistantMessage.tool_calls[toolCall.index].function.arguments += toolCall.function.arguments;
              }
            }
          }
        }
      }

      // Add the complete assistant message
      messages.push(assistantMessage);

      // If no tool calls, we're done
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        return assistantMessage.content || '';
      }

      // Execute tool calls
      for (const toolCall of assistantMessage.tool_calls) {
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