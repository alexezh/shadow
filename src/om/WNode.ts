/**
 * WNode - Root type for document tree
 */
export abstract class WNode {
  protected id: string;

  constructor(id: string) {
    this.id = id;
  }

  getId(): string {
    return this.id;
  }

  setId(id: string): void {
    this.id = id;
  }

  /**
   * Returns a 32-bit hash value for this node
   */
  abstract getHash(): number;

  /**
   * Check if this node has children
   */
  abstract hasChildren(): boolean;

  /**
   * Get children if this node supports them
   */
  abstract getChildren(): WNode[] | null;
}
