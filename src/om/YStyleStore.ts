import { YStyle } from './YStyle.js';

/**
 * YStyleStore - Collection of CSS styles indexed by selector
 */
export class YStyleStore {
  private styles: Map<string, YStyle>;

  constructor() {
    this.styles = new Map();
  }

  /**
   * Add or update a style
   */
  setStyle(style: YStyle): void {
    this.styles.set(style.getSelector(), style);
  }

  /**
   * Get style by selector
   */
  getStyle(selector: string): YStyle | undefined {
    return this.styles.get(selector);
  }

  /**
   * Check if style exists
   */
  hasStyle(selector: string): boolean {
    return this.styles.has(selector);
  }

  /**
   * Delete style by selector
   */
  deleteStyle(selector: string): void {
    this.styles.delete(selector);
  }

  /**
   * Get all styles
   */
  getStyles(): Map<string, YStyle> {
    return this.styles;
  }

  /**
   * Get all selectors
   */
  getSelectors(): string[] {
    return Array.from(this.styles.keys());
  }

  /**
   * Clear all styles
   */
  clear(): void {
    this.styles.clear();
  }

  /**
   * Get number of styles
   */
  getCount(): number {
    return this.styles.size;
  }

  /**
   * Convert all styles to CSS string
   */
  toCss(): string {
    return Array.from(this.styles.values())
      .map(style => style.toCss())
      .join('\n\n');
  }

  /**
   * Parse CSS text and add styles to store
   * Handles multiple CSS rules
   */
  parseCss(css: string): void {
    // Simple CSS parser - matches selector { properties }
    const rulePattern = /([^{]+)\{([^}]*)\}/g;
    let match;

    while ((match = rulePattern.exec(css)) !== null) {
      try {
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

        const style = new YStyle(selector, properties);
        this.setStyle(style);
      } catch (error) {
        console.error(`Error parsing CSS rule: ${match[0]}`, error);
      }
    }
  }

  /**
   * Export styles as JSON array
   */
  toJson(): Array<{ selector: string; properties: Record<string, string> }> {
    return Array.from(this.styles.values()).map(style => ({
      selector: style.getSelector(),
      properties: Object.fromEntries(style.getProperties().entries())
    }));
  }

  /**
   * Import styles from JSON array
   */
  fromJson(json: Array<{ selector: string; properties: Record<string, string> }>): void {
    for (const item of json) {
      const properties = new Map(Object.entries(item.properties));
      const style = new YStyle(item.selector, properties);
      this.setStyle(style);
    }
  }
}
