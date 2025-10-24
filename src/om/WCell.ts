import { WNode } from './WNode.js';

/**
 * WCell - Table cell containing content nodes
 */
export class WCell extends WNode {
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
  }

  insertChild(index: number, node: WNode): void {
    this.children.splice(index, 0, node);
  }

  removeChild(index: number): WNode | undefined {
    return this.children.splice(index, 1)[0];
  }

  /**
   * Returns a 32-bit hash value for this cell
   */
  getHash(): number {
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
