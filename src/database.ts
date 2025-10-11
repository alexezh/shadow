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
      CREATE INDEX IF NOT EXISTS idx_assets_terms ON assets(terms)
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
      CREATE TABLE IF NOT EXISTS context_terms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term TEXT NOT NULL,
        context_name TEXT NOT NULL,
        embedding BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_context_terms_name ON context_terms(context_name)
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

  async storeContextTerm(term: string, contextName: string, embedding: number[]): Promise<void> {
    const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);
    await this.runAsync(
      'INSERT INTO context_terms (term, context_name, embedding) VALUES (?, ?, ?)',
      [term, contextName, embeddingBlob]
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
      'SELECT term, context_name, embedding FROM context_terms ORDER BY created_at DESC'
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

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}