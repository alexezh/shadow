import { YNode } from './YNode.js';
import { YStr } from './YStr.js';

/**
 * WPara - Paragraph node that points to WStr
 */
export class YPara extends YNode {
  private str: YStr;

  constructor(id: string, str?: YStr) {
    super(id);
    this.str = str || new YStr();
  }

  getStr(): YStr {
    return this.str;
  }

  setStr(str: YStr): void {
    this.str = str;
    this.invalidateHash();
  }

  hasChildren(): boolean {
    return false;
  }

  getChildren(): YNode[] | null {
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
