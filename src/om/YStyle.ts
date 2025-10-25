/**
 * YStyle - Represents a CSS style rule with selector and properties
 */
export class YStyle {
  private selector: string;
  private properties: Map<string, string>;
  private cachedHash: number | null;

  constructor(selector: string, properties?: Map<string, string>) {
    this.selector = selector;
    this.properties = properties || new Map();
    this.cachedHash = null;
  }

  getSelector(): string {
    return this.selector;
  }

  setSelector(selector: string): void {
    this.selector = selector;
    this.invalidateHash();
  }

  /**
   * Get CSS property value
   */
  getProperty(name: string): string | undefined {
    return this.properties.get(name);
  }

  /**
   * Set CSS property
   */
  setProperty(name: string, value: string): void {
    this.properties.set(name, value);
    this.invalidateHash();
  }

  /**
   * Check if property exists
   */
  hasProperty(name: string): boolean {
    return this.properties.has(name);
  }

  /**
   * Delete property
   */
  deleteProperty(name: string): void {
    this.properties.delete(name);
    this.invalidateHash();
  }

  /**
   * Get all properties as entries
   */
  getProperties(): Map<string, string> {
    return this.properties;
  }

  /**
   * Convert to CSS string
   * Example: "p { color: red; font-size: 14px; }"
   */
  toCss(): string {
    if (this.properties.size === 0) {
      return `${this.selector} { }`;
    }

    const props = Array.from(this.properties.entries())
      .map(([key, value]) => `  ${key}: ${value};`)
      .join('\n');

    return `${this.selector} {\n${props}\n}`;
  }

  /**
   * Invalidate cached hash
   */
  invalidateHash(): void {
    this.cachedHash = null;
  }

  /**
   * Get hash of this style (cached)
   */
  getHash(): number {
    if (this.cachedHash === null) {
      this.cachedHash = this.computeHash();
    }
    return this.cachedHash;
  }

  /**
   * Compute 32-bit hash value for this style
   */
  private computeHash(): number {
    let hash = 0;

    // Hash the selector
    for (let i = 0; i < this.selector.length; i++) {
      const char = this.selector.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & 0x7FFFFFFF;
    }

    // Hash the properties in sorted order for consistency
    const sortedEntries = Array.from(this.properties.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    for (const [key, value] of sortedEntries) {
      // Hash key
      for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & 0x7FFFFFFF;
      }

      // Hash value
      for (let i = 0; i < value.length; i++) {
        const char = value.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & 0x7FFFFFFF;
      }
    }

    return hash;
  }

  /**
   * Create YStyle from CSS string
   * Example: "p { color: red; font-size: 14px; }"
   */
  static fromCss(css: string): YStyle {
    const match = css.match(/([^{]+)\{([^}]*)\}/);
    if (!match) {
      throw new Error('Invalid CSS format');
    }

    const selector = match[1].trim();
    const propsText = match[2].trim();

    const properties = new Map<string, string>();

    if (propsText) {
      const propPairs = propsText.split(';').map(p => p.trim()).filter(p => p);
      for (const pair of propPairs) {
        const colonIndex = pair.indexOf(':');
        if (colonIndex > 0) {
          const key = pair.substring(0, colonIndex).trim();
          const value = pair.substring(colonIndex + 1).trim();
          properties.set(key, value);
        }
      }
    }

    return new YStyle(selector, properties);
  }
}
