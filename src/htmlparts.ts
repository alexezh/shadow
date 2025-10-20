import { Database } from "./database";
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from "child_process";
import { addIdsToHtml } from "./htmlid.js";

// Buffer for chunked HTML parts: partid -> array of chunks
type HtmlPartBuffer = Map<string, Array<{ chunkIndex: number; html: string }>>;

const htmlPartBuffer: HtmlPartBuffer = new Map();

// Helper function to generate random ID
function generateId(): string {
  return Math.floor(Math.random() * 0x7FFFFFFF).toString(36);
}

// Assemble complete HTML document by resolving htmlpart:include comments
export async function assembleHtml(database: Database, docid: string): Promise<string> {
  // Get all HTML parts for this document, ordered by partid
  const parts = await database.getAllHtmlParts(docid);

  if (parts.length === 0) {
    throw new Error(`No HTML parts found for document: ${docid}`);
  }

  // Create a map of partid -> html for quick lookup
  const partsMap = new Map<string, string>();
  for (const part of parts) {
    partsMap.set(part.partid, part.html);
  }

  // Start with the main document (partid '0'), or first part if '0' not found
  let mainHtml = partsMap.get('0');
  if (!mainHtml) {
    console.warn(`⚠️ Main document part (partid='0') not found for docid: ${docid}, using parts in order`);

    // Assemble all parts in order (by partid)
    mainHtml = parts.map(p => p.html).join('\n');
  }

  // Recursively resolve includes
  function resolveIncludes(html: string, depth: number = 0): string {
    if (depth > 100) {
      throw new Error('Maximum include depth exceeded (100) - possible circular reference');
    }

    // Regular expression to match htmlpart:include comments
    // <!-- htmlpart:include id="<partid>" mime="text/html" scope="section|subsection|table|cell" target="<target-id>" required="true" -->
    const includePattern = /<!--\s*htmlpart:include\s+id=["']([^"']+)["'][^>]*-->/g;

    return html.replace(includePattern, (match, partid) => {
      const includedHtml = partsMap.get(partid);

      if (!includedHtml) {
        console.warn(`⚠️ Referenced part not found: ${partid}`);
        return match; // Keep the comment if part not found
      }

      // Recursively resolve any includes in the included HTML
      const resolvedHtml = resolveIncludes(includedHtml, depth + 1);

      // Return the comment followed by the resolved HTML
      return match + '\n' + resolvedHtml;
    });
  }

  // Resolve all includes starting from the main document
  let assembledHtml = resolveIncludes(mainHtml);

  // Add html and body tags if needed
  const hasHtmlTag = /<html[^>]*>/i.test(assembledHtml);
  const hasBodyTag = /<body[^>]*>/i.test(assembledHtml);

  if (!hasHtmlTag) {
    // Wrap in html tag
    if (!hasBodyTag) {
      // Need both html and body
      assembledHtml = `<!DOCTYPE html>\n<html>\n<body>\n${assembledHtml}\n</body>\n</html>`;
    } else {
      // Has body but not html
      assembledHtml = `<!DOCTYPE html>\n<html>\n${assembledHtml}\n</html>`;
    }
  } else if (!hasBodyTag) {
    // Has html but not body - insert body inside html
    assembledHtml = assembledHtml.replace(
      /(<html[^>]*>)/i,
      '$1\n<body>'
    );
    assembledHtml = assembledHtml.replace(
      /<\/html>/i,
      '</body>\n</html>'
    );
  }

  return assembledHtml;
}

export async function documentCreate(database: Database, args: { name: string }): Promise<string> {
  try {
    const docId = generateId();
    await database.createDocument(docId, args.name);

    console.log(`📄 Created document: id="${docId}" name="${args.name}"`);

    return JSON.stringify({
      success: true,
      id: docId,
      name: args.name,
      message: 'Document created successfully'
    }, null, 2);
  } catch (error: any) {
    console.error('❌ Error creating document:', error);
    return JSON.stringify({
      success: false,
      error: error.message
    }, null, 2);
  }
}

export async function storeHtmlPart(
  database: Database,
  args: { partid: string; docid: string; html: string; chunkIndex: number; eos: boolean }
): Promise<string> {
  try {
    const { partid, docid, html, chunkIndex, eos } = args;

    // Initialize buffer for this partid if it doesn't exist
    if (!htmlPartBuffer.has(partid)) {
      htmlPartBuffer.set(partid, []);
    }

    const chunks = htmlPartBuffer.get(partid)!;
    chunks.push({ chunkIndex, html });

    console.log(`💾 Buffered HTML part chunk: partid="${partid}" docid="${docid}" chunkIndex=${chunkIndex} eos=${eos} (${html.length} chars)`);

    // If this is the last chunk (eos=true), assemble and store
    if (eos) {
      // Sort chunks by index to ensure correct order
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

      // Validate chunk sequence
      for (let i = 0; i < chunks.length; i++) {
        if (chunks[i].chunkIndex !== i) {
          throw new Error(`Missing chunk ${i} for partid="${partid}". Expected chunks 0-${chunks.length - 1} but got indices: ${chunks.map(c => c.chunkIndex).join(', ')}`);
        }
      }

      // Assemble complete HTML
      const completeHtml = chunks.map(c => c.html).join('');

      // Add IDs to HTML elements that don't have them
      const htmlWithIds = addIdsToHtml(completeHtml);

      // Store in database
      await database.storeHtmlPart(partid, docid, htmlWithIds);

      // Clear buffer
      htmlPartBuffer.delete(partid);

      console.log(`✅ Assembled and stored HTML part: partid="${partid}" docid="${docid}" (${chunks.length} chunks, ${htmlWithIds.length} chars total)`);

      return JSON.stringify({
        success: true,
        partid: partid,
        docid: docid,
        chunks_received: chunks.length,
        html_length: htmlWithIds.length,
        html: htmlWithIds,
        message: 'HTML part assembled, IDs added, and stored successfully'
      }, null, 2);
    } else {
      // Not the last chunk, just acknowledge receipt
      return JSON.stringify({
        success: true,
        partid: partid,
        docid: docid,
        chunkIndex: chunkIndex,
        chunks_buffered: chunks.length,
        message: `Chunk ${chunkIndex} buffered, waiting for more chunks`
      }, null, 2);
    }
  } catch (error: any) {
    console.error('❌ Error storing HTML part:', error);
    // Clean up buffer on error
    htmlPartBuffer.delete(args.partid);
    return JSON.stringify({
      success: false,
      error: error.message
    }, null, 2);
  }
}

export async function loadHtmlPart(database: Database, args: { docid: string; partid: string }): Promise<string> {
  try {
    const result = await database.loadHtmlPart(args.docid, args.partid);

    if (!result) {
      console.log(`⚠️ HTML part not found: docid="${args.docid}" partid="${args.partid}"`);
      return JSON.stringify({
        success: false,
        error: 'HTML part not found',
        docid: args.docid,
        partid: args.partid
      }, null, 2);
    }

    console.log(`📖 Loaded HTML part: partid="${result.partid}" docid="${result.docid}" (${result.html.length} chars)`);

    return JSON.stringify({
      success: true,
      id: result.id,
      partid: result.partid,
      docid: result.docid,
      html: result.html,
      html_length: result.html.length
    }, null, 2);
  } catch (error: any) {
    console.error('❌ Error loading HTML part:', error);
    return JSON.stringify({
      success: false,
      error: error.message
    }, null, 2);
  }
}

export async function handleListParts(database: Database, docid?: string): Promise<void> {
  try {
    // Pass docid directly to database method for efficient filtering
    const parts = await database.getAllHtmlParts(docid);

    if (parts.length === 0) {
      if (docid) {
        console.log(`No HTML parts found for document: ${docid}`);
      } else {
        console.log('No HTML parts found.');
      }
      return;
    }

    // Group parts by docid
    const partsByDoc = new Map<string, Array<{ id: number, partid: string, html: string }>>();
    for (const part of parts) {
      if (!partsByDoc.has(part.docid)) {
        partsByDoc.set(part.docid, []);
      }
      partsByDoc.get(part.docid)!.push({ id: part.id, partid: part.partid, html: part.html });
    }

    // Display as hierarchy
    console.log('\nHTML Parts Hierarchy:');
    for (const [docid, docParts] of partsByDoc) {
      console.log(`\n📄 ${docid}`);
      for (const part of docParts) {
        const preview = part.html.substring(0, 60).replace(/\n/g, ' ');
        console.log(`  └─ ${part.partid}: ${preview}${part.html.length > 60 ? '...' : ''}`);
      }
    }
    console.log(`\nTotal: ${parts.length} parts across ${partsByDoc.size} documents`);
  } catch (error) {
    console.error('❌ Error listing parts:', error);
  }
}

export async function handleEditPart(database: Database, docid: string, partid: string): Promise<void> {
  try {
    // Load the part from database
    const part = await database.loadHtmlPart(docid, partid);

    if (!part) {
      console.log(`❌ Part not found: docid="${docid}" partid="${partid}"`);
      return;
    }

    // Get editor from environment variable or use default
    const editor = process.env.SHADOW_EDITOR || process.env.EDITOR || 'vim';

    // Create temporary file
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `shadow-part-${partid}.html`);

    // Write current content to temp file
    fs.writeFileSync(tmpFile, part.html, 'utf-8');
    console.log(`Opening ${tmpFile} in ${editor}...`);

    // Spawn editor
    return new Promise((resolve, reject) => {
      const editorProcess = spawn(editor, [tmpFile], {
        stdio: 'inherit'
      });

      editorProcess.on('exit', async (code) => {
        if (code === 0) {
          try {
            // Read updated content
            const updatedHtml = fs.readFileSync(tmpFile, 'utf-8');

            // Update database with both docid and partid
            await database.updateHtmlPart(part.docid, partid, updatedHtml);
            console.log(`✓ Updated part ${partid} (docid: ${part.docid}) in database`);

            // Clean up temp file
            fs.unlinkSync(tmpFile);
            resolve();
          } catch (error) {
            console.error('❌ Error updating part:', error);
            reject(error);
          }
        } else {
          console.log('Editor exited without saving (or with error)');
          fs.unlinkSync(tmpFile);
          resolve();
        }
      });

      editorProcess.on('error', (error) => {
        console.error(`❌ Failed to launch editor ${editor}:`, error);
        console.log('Set SHADOW_EDITOR or EDITOR environment variable to specify your preferred editor');
        fs.unlinkSync(tmpFile);
        reject(error);
      });
    });
  } catch (error) {
    console.error('❌ Error editing part:', error);
  }
}
