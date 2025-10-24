import { YNode } from './YNode.js';

/**
 * WTable - Table element containing rows
 */
export class YTable extends YNode {
  private children: YNode[];

  constructor(id: string, children?: YNode[]) {
    super(id);
    this.children = children || [];
  }

  hasChildren(): boolean {
    return true;
  }

  getChildren(): YNode[] {
    return this.children;
  }

  addChild(node: YNode): void {
    this.children.push(node);
    this.invalidateHash();

    // Update node map if doc is set
    const doc = this.getDoc();
    if (doc) {
      doc.addNodeToMapPublic(node);
    }
  }

  insertChild(index: number, node: YNode): void {
    this.children.splice(index, 0, node);
    this.invalidateHash();

    // Update node map if doc is set
    const doc = this.getDoc();
    if (doc) {
      doc.addNodeToMapPublic(node);
    }
  }

  removeChild(index: number): YNode | undefined {
    const result = this.children.splice(index, 1)[0];
    this.invalidateHash();

    // Update node map if doc is set
    const doc = this.getDoc();
    if (doc && result) {
      doc.removeNodeFromMapPublic(result);
    }

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
