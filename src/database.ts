import sqlite3 from 'sqlite3';
import { promisify } from 'util';

export class Database {
  private db: sqlite3.Database;
  private runAsync: (sql: string, params?: any[]) => Promise<sqlite3.RunResult>;
  private getAsync: (sql: string, params?: any[]) => Promise<any>;
  private allAsync: (sql: string, params?: any[]) => Promise<any[]>;

  constructor(dbPath: string = './embeddings.db') {
    this.db = new sqlite3.Database(dbPath);
    this.runAsync = promisify(this.db.run.bind(this.db));
    this.getAsync = promisify(this.db.get.bind(this.db));
    this.allAsync = promisify(this.db.all.bind(this.db));
  }

  async initialize(): Promise<void> {
    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        terms TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS instructions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        terms TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_assets_terms ON assets(terms)
    `);
    
    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_instructions_terms ON instructions(terms)
    `);
  }

  async storeAsset(terms: string[], text: string, embedding: number[]): Promise<void> {
    const termsString = JSON.stringify(terms);
    const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);

    await this.runAsync(
      'INSERT INTO assets (terms, text, embedding) VALUES (?, ?, ?)',
      [termsString, text, embeddingBlob]
    );
  }

  async storeInstruction(terms: string[], text: string, embedding: number[]): Promise<void> {
    const termsString = JSON.stringify(terms);
    const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);

    await this.runAsync(
      'INSERT INTO instructions (terms, text, embedding) VALUES (?, ?, ?)',
      [termsString, text, embeddingBlob]
    );
  }

  async findSimilarTexts(terms: string[], limit: number = 10): Promise<Array<{ text: string, similarity: number }>> {
    const termsString = JSON.stringify(terms);

    // For now, we'll do a simple exact match on terms
    // In a production system, you'd want to compute cosine similarity on embeddings
    const results = await this.allAsync(
      'SELECT text, embedding FROM embeddings WHERE terms = ? ORDER BY created_at DESC LIMIT ?',
      [termsString, limit]
    );

    return results.map(row => ({
      text: row.text,
      similarity: 1.0 // Placeholder - would compute actual similarity
    }));
  }

  async getAllTextsForTerms(terms: string[]): Promise<string[]> {
    const termsString = JSON.stringify(terms);

    const results = await this.allAsync(
      'SELECT text FROM embeddings WHERE terms = ? ORDER BY created_at DESC',
      [termsString]
    );

    return results.map(row => row.text);
  }

  async getAllInstructions(): Promise<Array<{ terms: string, text: string }>> {
    const results = await this.allAsync(
      'SELECT terms, text FROM instructions ORDER BY created_at DESC'
    );

    return results.map(row => ({
      terms: row.terms,
      text: row.text
    }));
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  private embeddingFromBlob(blob: Buffer): number[] {
    const floatArray = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
    return Array.from(floatArray);
  }

  async getAssets(queryEmbedding: number[], limit: number = 10): Promise<Array<{ terms: string[], text: string, similarity: number }>> {
    const results = await this.allAsync(
      'SELECT terms, text, embedding FROM assets ORDER BY created_at DESC'
    );

    const similarities = results.map(row => {
      const storedEmbedding = this.embeddingFromBlob(row.embedding);
      const similarity = this.cosineSimilarity(queryEmbedding, storedEmbedding);

      return {
        terms: JSON.parse(row.terms) as string[],
        text: row.text,
        similarity
      };
    });

    // Sort by similarity (highest first) and limit results
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async getInstructions(queryEmbedding: number[], limit: number = 10): Promise<Array<{ terms: string[], text: string, similarity: number }>> {
    const results = await this.allAsync(
      'SELECT terms, text, embedding FROM instructions ORDER BY created_at DESC'
    );

    const similarities = results.map(row => {
      const storedEmbedding = this.embeddingFromBlob(row.embedding);
      const similarity = this.cosineSimilarity(queryEmbedding, storedEmbedding);

      return {
        terms: JSON.parse(row.terms) as string[],
        text: row.text,
        similarity
      };
    });

    // Sort by similarity (highest first) and limit results
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async clearInstructions(): Promise<void> {
    await this.runAsync('DELETE FROM instructions');
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}