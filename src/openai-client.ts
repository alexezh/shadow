import OpenAI from 'openai';
import { MCPLocalClient } from './mcp-client.js';
import { Database } from './database.js';
import { ChatCompletionTool } from 'openai/resources/index.js';

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if it's a rate limit error
      // Handle both HTTP 429 status and OpenAI RateLimitError
      const isRateLimitError =
        error?.status === 429 ||
        error?.code === 'rate_limit_exceeded' ||
        error?.type === 'rate_limit_exceeded' ||
        error?.constructor?.name === 'RateLimitError' ||
        error?.message?.includes('Rate limit reached');

      if (isRateLimitError) {
        if (attempt < maxRetries) {
          // Extract wait time from error message if available
          // Handles formats like "Please try again in 718ms" or "Please try again in 2.5s"
          const waitTimeMsMatch = error?.message?.match(/Please try again in (\d+)ms/);
          const waitTimeSecMatch = error?.message?.match(/Please try again in ([\d.]+)s/);

          let waitTime: number;
          if (waitTimeMsMatch) {
            waitTime = parseInt(waitTimeMsMatch[1]);
          } else if (waitTimeSecMatch) {
            waitTime = Math.ceil(parseFloat(waitTimeSecMatch[1]) * 1000);
          } else {
            // Exponential backoff if no wait time specified
            waitTime = initialDelayMs * Math.pow(2, attempt);
          }

          // Add a small buffer to the wait time to ensure we're past the rate limit
          waitTime = Math.ceil(waitTime * 1.1) + 100;

          console.log(`⏳ Rate limit hit, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      } else {
        // For non-rate-limit errors, throw immediately
        throw error;
      }
    }
  }

  throw lastError;
}

export async function generateEmbedding(client: OpenAI, terms: string | string[]): Promise<number[]> {
  return retryWithBackoff(async () => {
    let text = (Array.isArray(terms)) ? terms.join(' ') : terms;
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: terms
    });

    return response.data[0]?.embedding || [];
  });
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
    
    // Set the current prompt in the MCP client for history tracking
    this.mcpClient.setCurrentPrompt(userMessage);

    let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    // Loop to handle multiple function calls
    let maxIterations = 100;
    let iteration = 0;

    while (iteration < maxIterations) {
      const response = await retryWithBackoff(async () => {
        return this.client.chat.completions.create({
          model: 'gpt-4.1',
          messages,
          tools: mcpTools,
          stream: true,
          tool_choice: 'auto',
          max_tokens: 1500,
          //max_completion_tokens: 1500,
          temperature: 0.7
        });
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