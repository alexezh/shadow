import sqlite3 from 'sqlite3';
import { promisify } from 'util';

export class Database {
  private db: sqlite3.Database;
  private runAsync: (sql: string, params?: any[]) => Promise<sqlite3.RunResult>;
  private getAsync: (sql: string, params?: any[]) => Promise<any>;
  private allAsync: (sql: string, params?: any[]) => Promise<any[]>;

  constructor(dbPath: string = './shadow.db') {
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

    // Recreate instructions table with text field instead of data_id
    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS instructions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keywords TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_instructions_keywords ON instructions(keywords)
    `);

    // Create instruction_emb table for storing instruction embeddings
    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS instruction_emb (
        emb_id INTEGER PRIMARY KEY AUTOINCREMENT,
        instruction_id INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (instruction_id) REFERENCES instructions (id)
      )
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_instruction_emb_instruction_id ON instruction_emb(instruction_id)
    `);

    // Create history table
    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt TEXT NOT NULL,
        work_summary TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create context table
    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS context (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        modified_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_context_name ON context(name)
    `);

    // Create context_terms table for mapping embeddings to context names
    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS context_emb (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL,
        context_name TEXT NOT NULL,
        embedding BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_context_emb_name ON context_emb(context_name)
    `);

    // Recreate assets table with data_id reference
    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT,
        keywords TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create asset_emb table for storing asset embeddings
    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS asset_emb (
        emb_id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (asset_id) REFERENCES assets (id)
      )
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_assets_terms ON assets(keywords)
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_asset_emb_asset_id ON asset_emb(asset_id)
    `);

    // Create keyword_emb table for storing keyword embeddings
    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS keyword_emb (
        emb_id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL,
        embedding BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_keyword_emb_keyword ON keyword_emb(keyword)
    `);

    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS rulemodel (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        model_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async storeAsset(keywords: string[], text: string, embedding: number[], filename?: string, sourceDoc?: string, kind?: string): Promise<void> {
    const keywordsString = JSON.stringify(keywords);
    const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);

    // Insert asset directly with text
    const result = await this.runAsync(
      'INSERT INTO assets (filename, keywords, text) VALUES (?, ?, ?)',
      [filename || null, keywordsString, text]
    );

    if (!result || result.lastID === undefined || result.lastID === null) {
      throw new Error('Failed to insert asset: no lastID returned');
    }

    const assetId = result.lastID;

    // Insert embedding into asset_emb table
    await this.runAsync(
      'INSERT INTO asset_emb (asset_id, embedding) VALUES (?, ?)',
      [assetId, embeddingBlob]
    );
  }

  async storeInstruction(keywords: string[], text: string): Promise<number> {
    const keywordsString = JSON.stringify(keywords);

    // Insert instruction directly with text
    const result = await this.runAsync(
      'INSERT INTO instructions (keywords, text) VALUES (?, ?)',
      [keywordsString, text]
    );

    if (!result || result.lastID === undefined || result.lastID === null) {
      throw new Error('Failed to insert instruction: no lastID returned');
    }

    return result.lastID;
  }

  async storeInstructionEmbedding(instructionId: number, embedding: number[]): Promise<void> {
    const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);

    // Insert embedding into instruction_emb table
    const result = await this.runAsync(
      'INSERT INTO instruction_emb (instruction_id, embedding) VALUES (?, ?)',
      [instructionId, embeddingBlob]
    );

    if (result.lastID === undefined || result.lastID === null) {
      throw new Error('Failed to insert instruction embedding: no lastID returned');
    }
  }

  async getAllTextsForTerms(terms: string[]): Promise<string[]> {
    const termsString = JSON.stringify(terms);

    const results = await this.allAsync(
      'SELECT text FROM assets WHERE keywords = ? ORDER BY created_at DESC',
      [termsString]
    );

    return results.map(row => row.text);
  }

  async getAllInstructions(): Promise<Array<{ keywords: string, text: string }>> {
    const results = await this.allAsync(
      'SELECT keywords, text FROM instructions ORDER BY created_at DESC'
    );

    return results.map(row => ({
      keywords: row.keywords,
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
    Promise<Array<{ keywords: string[], text: string, filename: string | null, similarity: number }>> {

    let sql = 'SELECT a.id, a.filename, a.keywords, a.text, ae.embedding FROM assets a JOIN asset_emb ae ON a.id = ae.asset_id';
    let params: any[] = [];

    sql += ' ORDER BY a.created_at DESC';

    const results = await this.allAsync(sql, params);

    const similarities = results.map(row => {
      const storedEmbedding = this.embeddingFromBlob(row.embedding);
      const similarity = this.cosineSimilarity(queryEmbedding, storedEmbedding);

      return {
        keywords: JSON.parse(row.keywords) as string[],
        text: row.text,
        filename: row.filename,
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
      'SELECT i.id, i.keywords, i.text, ie.embedding FROM instructions i JOIN instruction_emb ie ON i.id = ie.instruction_id ORDER BY i.created_at DESC'
    );

    const similarities = results.map(row => {
      const storedEmbedding = this.embeddingFromBlob(row.embedding);
      const similarity = this.cosineSimilarity(queryEmbedding, storedEmbedding);

      return {
        terms: JSON.parse(row.keywords) as string[],
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
    // Delete instruction embeddings first (foreign key constraint)
    await this.runAsync('DELETE FROM instruction_emb');

    // Delete instructions
    await this.runAsync('DELETE FROM instructions');
  }

  async storeHistory(prompt: string, workSummary: string): Promise<void> {
    await this.runAsync(
      'INSERT INTO history (prompt, work_summary) VALUES (?, ?)',
      [prompt, workSummary]
    );
  }

  async getHistory(limit: number = 10): Promise<Array<{ id: number, prompt: string, workSummary: string, createdAt: string }>> {
    const results = await this.allAsync(
      'SELECT id, prompt, work_summary, created_at FROM history ORDER BY created_at DESC LIMIT ?',
      [limit]
    );

    return results.map(row => ({
      id: row.id,
      prompt: row.prompt,
      workSummary: row.work_summary,
      createdAt: row.created_at
    }));
  }

  async storeContext(name: string, value: string): Promise<void> {
    await this.runAsync(
      'INSERT INTO context (name, value, modified_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [name, value]
    );
  }

  async storeContextTerm(keyword: string, contextName: string, embedding: number[]): Promise<void> {
    const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);
    await this.runAsync(
      'INSERT INTO context_emb (keyword, context_name, embedding) VALUES (?, ?, ?)',
      [keyword, contextName, embeddingBlob]
    );
  }

  async loadContext(name: string, limit: number = 1): Promise<Array<{ id: number, name: string, value: string, modifiedAt: string }>> {
    const results = await this.allAsync(
      'SELECT id, name, value, modified_at FROM context WHERE name = ? ORDER BY modified_at DESC LIMIT ?',
      [name, limit]
    );

    return results.map(row => ({
      id: row.id,
      name: row.name,
      value: row.value,
      modifiedAt: row.modified_at
    }));
  }

  async findContextByEmbedding(queryEmbedding: number[], limit: number = 1): Promise<Array<{ contextName: string, term: string, similarity: number }>> {
    const results = await this.allAsync(
      'SELECT keyword, context_name, embedding FROM context_emb ORDER BY created_at DESC'
    );

    const similarities = results.map(row => {
      const storedEmbedding = this.embeddingFromBlob(row.embedding);
      const similarity = this.cosineSimilarity(queryEmbedding, storedEmbedding);

      return {
        term: row.term,
        contextName: row.context_name,
        similarity
      };
    });

    // Sort by similarity (highest first) and limit results
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async storeKeywordEmbedding(keyword: string, embedding: number[]): Promise<void> {
    const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);

    // Insert keyword embedding into keyword_emb table
    await this.runAsync(
      'INSERT INTO keyword_emb (keyword, embedding) VALUES (?, ?)',
      [keyword, embeddingBlob]
    );
  }

  async findKeywordsByEmbedding(queryEmbedding: number[], limit: number = 10): Promise<Array<{ keyword: string, similarity: number }>> {
    const results = await this.allAsync(
      'SELECT keyword, embedding FROM keyword_emb ORDER BY created_at DESC'
    );

    const similarities = results.map(row => {
      const storedEmbedding = this.embeddingFromBlob(row.embedding);
      const similarity = this.cosineSimilarity(queryEmbedding, storedEmbedding);

      return {
        keyword: row.keyword,
        similarity
      };
    });

    // Sort by similarity (highest first) and limit results
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async storeRuleModel(name: string, modelJson: string): Promise<void> {
    await this.runAsync(
      `INSERT INTO rulemodel (name, model_json, created_at, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(name) DO UPDATE SET model_json = excluded.model_json, updated_at = CURRENT_TIMESTAMP`,
      [name, modelJson]
    );
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
