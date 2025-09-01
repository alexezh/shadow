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
      CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        terms TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_terms ON embeddings(terms)
    `);
  }

  async storeEmbedding(terms: string[], text: string, embedding: number[]): Promise<void> {
    const termsString = JSON.stringify(terms);
    const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);
    
    await this.runAsync(
      'INSERT INTO embeddings (terms, text, embedding) VALUES (?, ?, ?)',
      [termsString, text, embeddingBlob]
    );
  }

  async findSimilarTexts(terms: string[], limit: number = 10): Promise<Array<{text: string, similarity: number}>> {
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

  async getAllRules(): Promise<Array<{terms: string, text: string}>> {
    const results = await this.allAsync(
      'SELECT terms, text FROM embeddings ORDER BY created_at DESC'
    );

    return results.map(row => ({
      terms: row.terms,
      text: row.text
    }));
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