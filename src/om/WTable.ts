import { WNode } from './WNode.js';

/**
 * WTable - Table element containing rows
 */
export class WTable extends WNode {
  private children: WNode[];

  constructor(id: string, children?: WNode[]) {
    super(id);
    this.children = children || [];
  }

  hasChildren(): boolean {
    return true;
  }

  getChildren(): WNode[] {
    return this.children;
  }

  addChild(node: WNode): void {
    this.children.push(node);
    this.invalidateHash();
  }

  insertChild(index: number, node: WNode): void {
    this.children.splice(index, 0, node);
    this.invalidateHash();
  }

  removeChild(index: number): WNode | undefined {
    const result = this.children.splice(index, 1)[0];
    this.invalidateHash();
    return result;
  }

  /**
   * Compute a 32-bit hash value for this table
   */
  protected computeHash(): number {
    let hash = 0;

    // Hash the ID
    for (let i = 0; i < this.id.length; i++) {
      const char = this.id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & 0x7FFFFFFF;
    }

    // Hash all children
    for (const child of this.children) {
      hash = ((hash << 5) - hash) + child.getHash();
      hash = hash & 0x7FFFFFFF;
    }

    return hash;
  }
}
