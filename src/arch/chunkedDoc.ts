import * as cheerio from 'cheerio';
import { Database } from '../database.js';

export interface DocPart {
  partid: string;
  $: cheerio.CheerioAPI;
  html: string;
}

export interface ParagraphInfo {
  id: string;
  partid: string;
  $element: cheerio.Cheerio<any>;
}

export class ChunkedDoc {
  private docid: string;
  private parts: Map<string, DocPart> = new Map();
  private paragraphMap: Map<string, ParagraphInfo> = new Map();

  constructor(docid: string) {
    this.docid = docid;
  }

  /**
   * Load document from database and build paragraph map
   */
  async load(database: Database): Promise<void> {
    const allParts = await database.getAllHtmlParts(this.docid);

    if (allParts.length === 0) {
      throw new Error(`No HTML parts found for document: ${this.docid}`);
    }

    // Load each part with cheerio
    for (const part of allParts) {
      const $ = cheerio.load(part.html);
      this.parts.set(part.partid, {
        partid: part.partid,
        $,
        html: part.html
      });

      // Build paragraph map for this part
      this.indexParagraphs(part.partid, $);
    }

    console.log(`📚 Loaded document ${this.docid}: ${this.parts.size} parts, ${this.paragraphMap.size} paragraphs indexed`);
  }

  /**
   * Index all paragraphs with IDs in a part
   */
  private indexParagraphs(partid: string, $: cheerio.CheerioAPI): void {
    const paragraphTags = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th'];

    // Find all elements with IDs that match paragraph tags
    for (const tag of paragraphTags) {
      $(`${tag}[id]`).each((_, elem) => {
        const $elem = $(elem);
        const id = $elem.attr('id');
        if (id) {
          this.paragraphMap.set(id, {
            id,
            partid,
            $element: $elem
          });
        }
      });
    }
  }

  /**
   * Get a paragraph by ID
   */
  getParagraph(id: string): ParagraphInfo | undefined {
    return this.paragraphMap.get(id);
  }

  /**
   * Get a part by partid
   */
  getPart(partid: string): DocPart | undefined {
    return this.parts.get(partid);
  }

  /**
   * Get all part IDs
   */
  getPartIds(): string[] {
    return Array.from(this.parts.keys());
  }

  /**
   * Save all parts back to database
   */
  async save(database: Database): Promise<void> {
    for (const [partid, part] of this.parts) {
      const updatedHtml = part.$.html();
      await database.updateHtmlPart(this.docid, partid, updatedHtml);
    }
    console.log(`💾 Saved document ${this.docid}: ${this.parts.size} parts updated`);
  }

  /**
   * Get the cheerio instance for a specific part
   */
  getCheerio(partid: string): cheerio.CheerioAPI | undefined {
    return this.parts.get(partid)?.$;
  }

  /**
   * Get all paragraphs between start and end (inclusive)
   * Returns array of paragraph infos in document order
   */
  getParagraphRange(startId: string, endId: string): ParagraphInfo[] {
    const result: ParagraphInfo[] = [];
    const allIds = Array.from(this.paragraphMap.keys());

    const startIdx = allIds.indexOf(startId);
    const endIdx = allIds.indexOf(endId);

    if (startIdx === -1 || endIdx === -1) {
      return result;
    }

    for (let i = startIdx; i <= endIdx; i++) {
      const para = this.paragraphMap.get(allIds[i]);
      if (para) {
        result.push(para);
      }
    }

    return result;
  }

  /**
   * Get total number of parts
   */
  getPartCount(): number {
    return this.parts.size;
  }

  /**
   * Get total number of indexed paragraphs
   */
  getParagraphCount(): number {
    return this.paragraphMap.size;
  }
}
