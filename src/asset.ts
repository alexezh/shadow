import path from "path";
import * as fs from 'fs/promises';
import { generateEmbedding } from "./openai-client.js";
import { Database } from "./database.js";
import OpenAI from "openai";

export type StoreAssetsArgs = {
  kind: string;
  filename?: string;
  terms: string[];
  content: any;
  chunkId?: string;
  chunkIndex?: number;
  totalChunks?: number;
}

// Buffer for chunked content
export type ContentBuffer = Map<string, {
  chunks: Array<{ chunkIndex: number; content: string; totalChunks: number }>;
  filename?: string;
  terms: string[];
  isComplete: boolean;
}>;

export async function storeAsset(
  database: Database,
  openaiClient: OpenAI,
  contentBuffer: ContentBuffer,
  args: StoreAssetsArgs): Promise<string> {

  // Normalize non-chunked content to single chunk format
  if (args.chunkId === undefined || args.chunkIndex === undefined || args.totalChunks === undefined) {
    args.chunkId = `single_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    args.chunkIndex = 0;
    args.totalChunks = 1;
  }

  // Handle all content as chunks (unified logic)
  // Get or create buffer entry
  let bufferEntry = contentBuffer.get(args.chunkId);
  if (!bufferEntry) {
    bufferEntry = {
      chunks: [],
      filename: args.filename,
      terms: args.terms,
      isComplete: false
    };
    contentBuffer.set(args.chunkId, bufferEntry);
  }

  // Add this chunk
  bufferEntry.chunks.push({
    chunkIndex: args.chunkIndex,
    content: typeof args.content === 'string' ? args.content : JSON.stringify(args.content),
    totalChunks: args.totalChunks
  });

  console.log(`📦 Received chunk [${args.kind}] [${args.chunkIndex + 1}/${args.totalChunks}] for ${args.chunkId} (${args.content.length} chars)`);

  // Check if we have all chunks
  if (bufferEntry.chunks.length !== args.totalChunks) {
    return `Chunk ${args.chunkIndex + 1}/${args.totalChunks} received for ${args.chunkId}. Waiting for remaining chunks.`;
  }

  // Sort chunks by index and combine
  bufferEntry.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  const completeContent = bufferEntry.chunks.map(chunk => chunk.content).join('');

  console.log(`✅ All chunks received for ${args.chunkId}. Total content: ${completeContent.length} chars`);

  // Update args with complete content for further processing
  const content = completeContent;

  // Clean up buffer
  contentBuffer.delete(args.chunkId);

  await processContent(database, openaiClient, args, content)
  const chunkInfo = args.totalChunks > 1 ? ` (${args.totalChunks} chunks)` : '';
  return `Successfully stored ${args.kind} data for terms: ${args.terms.join(', ')}${args.filename ? ` from file: ${args.filename}` : ''}${chunkInfo}`;
}

async function processContent(
  database: Database,
  openaiClient: OpenAI,
  args: StoreAssetsArgs, content: string): Promise<void> {
  // Optionally write to file for special kinds (blueprint/semantic)
  if (args.filename) {
    if (args.kind === 'blueprint') {
      //await this.writeSpecialFiles({ kind: "mapping", filename: args.filename }, content);
    } else if (args.kind === 'semantic') {
      await writeSpecialFiles(args, content);
    } else if (args.kind === 'html') {
      await writeSpecialFiles(args, content);
    }
  }

  if (args.kind === "blueprint") {
    //content = processBlueprint(args.filename, content);
    await writeSpecialFiles({ kind: "blueprint", filename: args.filename }, content);
  }

  let kind = args.kind ?? "text";

  // Always store full content in database
  const embedding = await generateEmbedding(openaiClient, args.terms);
  await database.storeAsset(args.terms, content, embedding, args.filename, args.filename, kind);
}


async function writeSpecialFiles(args: { kind?: string; filename?: string; }, content: string): Promise<void> {
  if (!args.filename) return;

  const contentDir = path.join(process.cwd(), 'content');
  const baseName = args.filename.replace(/\.[^.]+$/, ''); // Remove extension

  try {
    // Ensure content directory exists
    await fs.mkdir(contentDir, { recursive: true });

    let fileExtension: string;
    let processedContent: string;

    if (args.kind === 'semantic') {
      fileExtension = '.semantic.md';
    } else if (args.kind === 'mapping') {
      fileExtension = '.blueprint.json';
    } else if (args.kind === 'blueprint') {
      fileExtension = '.blueprint.md';
    } else if (args.kind === 'html') {
      fileExtension = '.output.html';
    } else {
      return; // Unknown kind, skip
    }

    const filePath = path.join(contentDir, `${baseName}${fileExtension}`);

    console.log(`🔍 Debug: ${args.kind} content length before write: ${content.length}`);
    await writeAndVerifyFile(filePath, content, args.kind);

  } catch (error) {
    console.error('❌ Error writing special files:', error);
  }
}

export async function writeAndVerifyFile(filePath: string, content: string, kind: string): Promise<void> {
  await fs.writeFile(filePath, content, { encoding: 'utf-8', flag: 'w' });

  // Verify the file was written correctly
  const writtenContent = await fs.readFile(filePath, 'utf-8');
  console.log(`📝 Wrote ${kind} data to: ${filePath} (wrote: ${content.length}, read back: ${writtenContent.length})`);

  if (writtenContent.length !== content.length) {
    console.error(`⚠️  File truncation detected! Expected ${content.length}, got ${writtenContent.length}`);
  }
}

export async function loadAsset(database: Database, openaiClient: OpenAI, args: { kind?: string; terms: string[] }): Promise<string> {
  const embedding = await generateEmbedding(openaiClient, args.terms);
  const assets = await database.getAssets(embedding, 1, args.kind ?? "text");

  if (assets.length > 0) {
    console.log(`loadAsset: [kind: ${args.kind}] [terms: ${JSON.stringify(args.terms)} [outfile: ${assets[0].filename}] [outterms: ${JSON.stringify(assets[0].terms)}]`)
  }

  return JSON.stringify({
    terms: args.terms,
    kind: args.kind,
    texts: assets.map(x => x.text),
    count: assets.length
  }, null, 2);
}
