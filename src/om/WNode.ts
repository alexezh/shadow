/**
 * WNode - Root type for document tree
 */
export abstract class WNode {
  protected id: string;
  protected cachedHash: number | null = null;

  constructor(id: string) {
    this.id = id;
  }

  getId(): string {
    return this.id;
  }

  setId(id: string): void {
    this.id = id;
    this.invalidateHash();
  }

  /**
   * Returns a 32-bit hash value for this node (cached)
   */
  getHash(): number {
    if (this.cachedHash === null) {
      this.cachedHash = this.computeHash();
    }
    return this.cachedHash;
  }

  /**
   * Invalidate cached hash (call when node changes)
   */
  protected invalidateHash(): void {
    this.cachedHash = null;
  }

  /**
   * Compute the hash value (implemented by subclasses)
   */
  protected abstract computeHash(): number;

  /**
   * Check if this node has children
   */
  abstract hasChildren(): boolean;

  /**
   * Get children if this node supports them
   */
  abstract getChildren(): WNode[] | null;
}
