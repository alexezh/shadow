import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { SkillDef } from './skilldef';

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

    // Recreate instructions table with name and text fields
    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS instructions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        keywords TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_instructions_keywords ON instructions(keywords)
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_instructions_name ON instructions(name)
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

    // Create documents table for tracking document metadata
    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        mainpart_id TEXT,
        blueprint_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_documents_filename ON documents(filename)
    `);

    // Create htmlparts table for storing HTML parts
    await this.runAsync(`
      CREATE TABLE IF NOT EXISTS htmlparts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        docid TEXT NOT NULL,
        partid TEXT NOT NULL,
        html TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(docid, partid),
        FOREIGN KEY (docid) REFERENCES documents (id)
      )
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_htmlparts_docid ON htmlparts(docid)
    `);

    await this.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_htmlparts_partid ON htmlparts(partid)
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

  async storeSkill(skill: SkillDef): Promise<number> {
    const keywordsString = JSON.stringify(skill.keywords);
    const text = JSON.stringify(skill);

    // Insert instruction with optional name
    const result = await this.runAsync(
      'INSERT INTO instructions (name, keywords, text) VALUES (?, ?, ?)',
      [skill.name || null, keywordsString, text]
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

  async getInstructionById(id: number): Promise<{ id: number, keywords: string[], text: string } | null> {
    const result = await this.getAsync(
      'SELECT id, keywords, text FROM instructions WHERE id = ?',
      [id]
    );

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      keywords: JSON.parse(result.keywords) as string[],
      text: result.text
    };
  }

  async getSkillsByName(name: string): Promise<(SkillDef & { id: number }) | undefined> {
    const result = await this.getAsync(
      'SELECT id, name, keywords, text FROM instructions WHERE name = ?',
      [name]
    );

    if (!result) {
      return undefined;
    }

    return { ...JSON.parse(result.text), id: result.id };
  }

  async findInstructionByKeywords(keywords: string[]): Promise<{ id: number, keywords: string[], text: string } | null> {
    const keywordsString = JSON.stringify(keywords.map(k => k.toLowerCase().trim()).sort());

    // Try exact match first
    const results = await this.allAsync(
      'SELECT id, keywords, text FROM instructions'
    );

    for (const row of results) {
      const storedKeywords = JSON.parse(row.keywords) as string[];
      const normalizedStored = JSON.stringify(storedKeywords.map((k: string) => k.toLowerCase().trim()).sort());

      if (normalizedStored === keywordsString) {
        return {
          id: row.id,
          keywords: storedKeywords,
          text: row.text
        };
      }
    }

    return null;
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

  async loadRuleModel(name: string): Promise<string | null> {
    const result = await this.getAsync(
      'SELECT model_json FROM rulemodel WHERE name = ?',
      [name]
    );
    return result ? result.model_json : null;
  }

  async storeHtmlPart(partid: string, docid: string, html: string): Promise<void> {
    await this.runAsync(
      'INSERT INTO htmlparts (docid, partid, html) VALUES (?, ?, ?) ON CONFLICT(docid, partid) DO UPDATE SET html = excluded.html',
      [docid, partid, html]
    );
  }

  async loadHtmlPart(docid: string, partid: string): Promise<{ id: number, partid: string, docid: string, html: string } | null> {
    const result = await this.getAsync(
      'SELECT id, docid, partid, html FROM htmlparts WHERE docid = ? AND partid = ?',
      [docid, partid]
    );

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      partid: result.partid,
      docid: result.docid,
      html: result.html
    };
  }

  async getAllHtmlParts(docid?: string): Promise<Array<{ id: number, partid: string, docid: string, html: string }>> {
    let sql = 'SELECT id, docid, partid, html FROM htmlparts';
    const params: any[] = [];

    if (docid) {
      sql += ' WHERE docid = ?';
      params.push(docid);
    }

    sql += ' ORDER BY docid, partid';

    const results = await this.allAsync(sql, params);

    return results.map(row => ({
      id: row.id,
      partid: row.partid,
      docid: row.docid,
      html: row.html
    }));
  }

  async updateHtmlPart(docid: string, partid: string, html: string): Promise<void> {
    await this.runAsync(
      'UPDATE htmlparts SET html = ? WHERE docid = ? AND partid = ?',
      [html, docid, partid]
    );
  }

  async createDocument(id: string, filename: string, mainpartId?: string, blueprintId?: string): Promise<void> {
    await this.runAsync(
      'INSERT INTO documents (id, filename, mainpart_id, blueprint_id) VALUES (?, ?, ?, ?)',
      [id, filename, mainpartId || null, blueprintId || null]
    );
  }

  async getDocument(id: string): Promise<{ id: string, filename: string, mainpartId: string | null, blueprintId: string | null, createdAt: string, updatedAt: string } | null> {
    const result = await this.getAsync(
      'SELECT id, filename, mainpart_id, blueprint_id, created_at, updated_at FROM documents WHERE id = ?',
      [id]
    );

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      filename: result.filename,
      mainpartId: result.mainpart_id,
      blueprintId: result.blueprint_id,
      createdAt: result.created_at,
      updatedAt: result.updated_at
    };
  }

  async getDocumentByFilename(filename: string): Promise<{ id: string, filename: string, mainpartId: string | null, blueprintId: string | null, createdAt: string, updatedAt: string } | null> {
    const result = await this.getAsync(
      'SELECT id, filename, mainpart_id, blueprint_id, created_at, updated_at FROM documents WHERE filename = ? ORDER BY created_at DESC LIMIT 1',
      [filename]
    );

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      filename: result.filename,
      mainpartId: result.mainpart_id,
      blueprintId: result.blueprint_id,
      createdAt: result.created_at,
      updatedAt: result.updated_at
    };
  }

  async getAllDocuments(): Promise<Array<{ id: string, filename: string, mainpartId: string | null, blueprintId: string | null, createdAt: string, updatedAt: string }>> {
    const results = await this.allAsync(
      'SELECT id, filename, mainpart_id, blueprint_id, created_at, updated_at FROM documents ORDER BY updated_at DESC'
    );

    return results.map(row => ({
      id: row.id,
      filename: row.filename,
      mainpartId: row.mainpart_id,
      blueprintId: row.blueprint_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async updateDocument(id: string, updates: { filename?: string, mainpartId?: string, blueprintId?: string }): Promise<void> {
    const setParts: string[] = [];
    const params: any[] = [];

    if (updates.filename !== undefined) {
      setParts.push('filename = ?');
      params.push(updates.filename);
    }
    if (updates.mainpartId !== undefined) {
      setParts.push('mainpart_id = ?');
      params.push(updates.mainpartId);
    }
    if (updates.blueprintId !== undefined) {
      setParts.push('blueprint_id = ?');
      params.push(updates.blueprintId);
    }

    if (setParts.length === 0) {
      return; // Nothing to update
    }

    setParts.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await this.runAsync(
      `UPDATE documents SET ${setParts.join(', ')} WHERE id = ?`,
      params
    );
  }

  async deleteDocument(id: string): Promise<void> {
    // Delete associated HTML parts first (foreign key constraint)
    await this.runAsync('DELETE FROM htmlparts WHERE docid = ?', [id]);

    // Delete the document
    await this.runAsync('DELETE FROM documents WHERE id = ?', [id]);
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
