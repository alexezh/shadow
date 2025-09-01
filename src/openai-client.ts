import OpenAI from 'openai';

export class OpenAIClient {
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY
    });
  }

  async generateInstructions(terms: string[]): Promise<string> {
    const prompt = `Generate detailed instructions for the following terms: ${terms.join(', ')}`;
    
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that provides clear, detailed instructions based on the given terms.'
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
    const termsText = terms.join(' ');
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: termsText
    });

    return response.data[0]?.embedding || [];
  }
}