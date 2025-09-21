import sqlite3 from 'sqlite3';
import { promisify } from 'util';

export class Database {
  private db: sqlite3.Database;
  private runAsync: (sql: string, params?: any[]) => Promise<sqlite3.RunResult>;
  private getAsync: (sql: string, params?: any[]) => Promise<any>;
  private allAsync: (sql: string, params?: any[]) => Promise<any[]>;

  constructor(dbPath: string = './embeddings.db') {
    this.db = new sqlite3.Database(dbPath);

    // Properly promisify the run method to return the Statement object with lastID
    this.runAsync = (sql: string, params?: any[]): Promise<sqlite3.RunResult> => {
      return new Promise((resolve, reject) => {
        this.db.run(sql, params || [], function (this: sqlite3.RunResult, err: Error | null) {
          if (err) reject(err);
          else resolve(this);
        });
      });
    };

    this.getAsync = promisify(this.db.get.bind(this.db));
    this.allAsync = promisify(this.db.all.bind(this.db));
  }

  async initialize(): Promise<void> {
    // Create data table to store text content
    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        sourceDoc TEXT,
        kind TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Recreate assets table with data_id reference
    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT,
        terms TEXT NOT NULL,
        data_id INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (data_id) REFERENCES data (id)
      )
    `);

    // Recreate instructions table with data_id reference
    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS instructions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        terms TEXT NOT NULL,
        data_id INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (data_id) REFERENCES data (id)
      )
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_assets_terms ON assets(terms)
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_instructions_terms ON instructions(terms)
    `);
  }

  async storeAsset(terms: string[], text: string, embedding: number[], filename?: string, sourceDoc?: string, kind?: string): Promise<void> {
    const termsString = JSON.stringify(terms);
    const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);

    // First, insert text into data table
    const dataResult = await this.runAsync(
      'INSERT INTO data (text, sourceDoc, kind) VALUES (?, ?, ?)',
      [text, sourceDoc || null, kind || null]
    );

    if (!dataResult) {
      throw new Error('Failed to insert data: no result returned');
    }

    const dataId = dataResult.lastID;

    if (dataId === undefined || dataId === null) {
      throw new Error('Failed to insert data: no lastID returned');
    }

    // Then insert asset with reference to data
    await this.runAsync(
      'INSERT INTO assets (filename, terms, data_id, embedding) VALUES (?, ?, ?, ?)',
      [filename || null, termsString, dataId, embeddingBlob]
    );
  }

  async storeInstruction(text: string, sourceDoc?: string, kind?: string): Promise<number> {
    // First, insert text into data table
    const dataResult = await this.runAsync(
      'INSERT INTO data (text, sourceDoc, kind) VALUES (?, ?, ?)',
      [text, sourceDoc || null, kind || 'instruction']
    );

    if (!dataResult) {
      throw new Error('Failed to insert data: no result returned');
    }

    const dataId = dataResult.lastID;

    if (dataId === undefined || dataId === null) {
      throw new Error('Failed to insert data: no lastID returned');
    }

    return dataId;
  }

  async storeInstructionEmbedding(terms: string, dataId: number, embedding: number[]): Promise<void> {
    const termsString = JSON.stringify(terms);
    const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);

    // Then insert instruction with reference to data
    const result = await this.runAsync(
      'INSERT INTO instructions (terms, data_id, embedding) VALUES (?, ?, ?)',
      [termsString, dataId, embeddingBlob]
    );
    if (result.lastID === undefined || result.lastID === null) {
      throw new Error('Failed to insert data: no lastID returned');
    }
  }

  async findSimilarTexts(terms: string[], limit: number = 10): Promise<Array<{ text: string, similarity: number }>> {
    const termsString = JSON.stringify(terms);

    // For now, we'll do a simple exact match on terms
    // In a production system, you'd want to compute cosine similarity on embeddings
    const results = await this.allAsync(
      'SELECT d.text, a.embedding FROM assets a JOIN data d ON a.data_id = d.id WHERE a.terms = ? ORDER BY a.created_at DESC LIMIT ?',
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
      'SELECT d.text FROM assets a JOIN data d ON a.data_id = d.id WHERE a.terms = ? ORDER BY a.created_at DESC',
      [termsString]
    );

    return results.map(row => row.text);
  }

  async getAllInstructions(): Promise<Array<{ terms: string, text: string }>> {
    const results = await this.allAsync(
      'SELECT i.terms, d.text FROM instructions i JOIN data d ON i.data_id = d.id ORDER BY i.created_at DESC'
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

  async getAssets(queryEmbedding: number[], limit: number = 2, kind?: string):
    Promise<Array<{ terms: string[], text: string, filename: string | null, sourceDoc: string | null, kind: string | null, similarity: number }>> {
    
    let sql = 'SELECT a.filename, a.terms, d.text, d.sourceDoc, d.kind, a.embedding FROM assets a JOIN data d ON a.data_id = d.id';
    let params: any[] = [];
    
    if (kind) {
      sql += ' WHERE d.kind = ?';
      params.push(kind);
    }
    
    sql += ' ORDER BY a.created_at DESC';
    
    const results = await this.allAsync(sql, params);

    const similarities = results.map(row => {
      const storedEmbedding = this.embeddingFromBlob(row.embedding);
      const similarity = this.cosineSimilarity(queryEmbedding, storedEmbedding);

      return {
        terms: JSON.parse(row.terms) as string[],
        text: row.text,
        filename: row.filename,
        sourceDoc: row.sourceDoc,
        kind: row.kind,
        similarity
      };
    });

    // Sort by similarity (highest first) and limit results
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async getInstructions(queryEmbedding: number[], limit: number = 3): Promise<Array<{ terms: string[], text: string, similarity: number }>> {
    const results = await this.allAsync(
      'SELECT i.terms, d.text, i.embedding FROM instructions i JOIN data d ON i.data_id = d.id ORDER BY i.created_at DESC'
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
    // Get data_ids that will be orphaned
    const orphanedData = await this.allAsync(
      'SELECT data_id FROM instructions'
    );

    // Delete instructions first
    await this.runAsync('DELETE FROM instructions');

    // Clean up orphaned data entries
    for (const row of orphanedData) {
      await this.runAsync('DELETE FROM data WHERE id = ?', [row.data_id]);
    }
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