import { WNode } from './WNode.js';
import { WStr } from './WStr.js';

/**
 * WPara - Paragraph node that points to WStr
 */
export class WPara extends WNode {
  private str: WStr;

  constructor(id: string, str?: WStr) {
    super(id);
    this.str = str || new WStr();
  }

  getStr(): WStr {
    return this.str;
  }

  setStr(str: WStr): void {
    this.str = str;
    this.invalidateHash();
  }

  hasChildren(): boolean {
    return false;
  }

  getChildren(): WNode[] | null {
    return null;
  }

  /**
   * Compute a 32-bit hash value for this paragraph
   */
  protected computeHash(): number {
    let hash = 0;

    // Hash the ID
    for (let i = 0; i < this.id.length; i++) {
      const char = this.id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & 0x7FFFFFFF;
    }

    // Hash the string content
    hash = ((hash << 5) - hash) + this.str.getHash();
    hash = hash & 0x7FFFFFFF;

    return hash;
  }
}
