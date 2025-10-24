/**
 * WPropSet - Set of CSS properties stored as key-value pairs
 */
export class YPropSet {
  private props: { [key: string]: any };
  private cachedHash: number | null = null;

  constructor() {
    this.props = {};
  }

  private invalidateHash(): void {
    this.cachedHash = null;
  }

  set(key: string, value: any): void {
    this.props[key] = value;
    this.invalidateHash();
  }

  get(key: string): any {
    return this.props[key];
  }

  has(key: string): boolean {
    return key in this.props;
  }

  delete(key: string): boolean {
    if (key in this.props) {
      delete this.props[key];
      this.invalidateHash();
      return true;
    }
    return false;
  }

  entries(): Array<[string, any]> {
    return Object.entries(this.props);
  }

  /**
   * Returns a 32-bit hash value for this property set (cached)
   */
  getHash(): number {
    if (this.cachedHash === null) {
      let hash = 0;
      const entries = Object.entries(this.props).sort(([a], [b]) => a.localeCompare(b));

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
