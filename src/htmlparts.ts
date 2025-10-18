import { Database } from "./database";

// Buffer for chunked HTML parts: partid -> array of chunks
type HtmlPartBuffer = Map<string, Array<{ chunkIndex: number; html: string }>>;

const htmlPartBuffer: HtmlPartBuffer = new Map();

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

      // Store in database
      await database.storeHtmlPart(partid, docid, completeHtml);

      // Clear buffer
      htmlPartBuffer.delete(partid);

      console.log(`✅ Assembled and stored HTML part: partid="${partid}" docid="${docid}" (${chunks.length} chunks, ${completeHtml.length} chars total)`);

      return JSON.stringify({
        success: true,
        partid: partid,
        docid: docid,
        chunks_received: chunks.length,
        html_length: completeHtml.length,
        message: 'HTML part assembled and stored successfully'
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

export async function loadHtmlPart(database: Database, args: { partid: string }): Promise<string> {
  try {
    const result = await database.loadHtmlPart(args.partid);

    if (!result) {
      console.log(`⚠️ HTML part not found: partid="${args.partid}"`);
      return JSON.stringify({
        success: false,
        error: 'HTML part not found',
        partid: args.partid
      }, null, 2);
    }

    console.log(`📖 Loaded HTML part: partid="${result.partid}" docid="${result.docid}" (${result.html.length} chars)`);

    return JSON.stringify({
      success: true,
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