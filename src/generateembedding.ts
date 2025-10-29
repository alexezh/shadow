import { OpenAI } from "openai/client";
import { retryWithBackoff } from "./retrywithbackoff.js";

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
