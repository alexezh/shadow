/**
 * WPropSet - Set of CSS properties stored as key-value pairs
 */
export class WPropSet {
  private props: Map<string, any>;
  private cachedHash: number | null = null;

  constructor(props?: Map<string, any>) {
    this.props = props || new Map();
  }

  private invalidateHash(): void {
    this.cachedHash = null;
  }

  set(key: string, value: any): void {
    this.props.set(key, value);
    this.invalidateHash();
  }

  get(key: string): any {
    return this.props.get(key);
  }

  has(key: string): boolean {
    return this.props.has(key);
  }

  delete(key: string): boolean {
    const result = this.props.delete(key);
    if (result) {
      this.invalidateHash();
    }
    return result;
  }

  entries(): IterableIterator<[string, any]> {
    return this.props.entries();
  }

  /**
   * Returns a 32-bit hash value for this property set (cached)
   */
  getHash(): number {
    if (this.cachedHash === null) {
      let hash = 0;
      const entries = Array.from(this.props.entries()).sort(([a], [b]) => a.localeCompare(b));

      for (const [key, value] of entries) {
        const str = `${key}:${JSON.stringify(value)}`;
        for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & 0x7FFFFFFF; // Keep it 31-bit positive
        }
      }

      this.cachedHash = hash;
    }

    return this.cachedHash;
  }
}
