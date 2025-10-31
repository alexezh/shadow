/**
 * HtmlWriter - Accumulates HTML parts and can create a final string
 */
export class HtmlWriter {
  private parts: string[];

  constructor() {
    this.parts = [];
  }

  /**
   * Append a string to the output
   */
  write(text: string): void {
    this.parts.push(text);
  }

  /**
   * Write an opening tag
   */
  writeOpenTag(tagName: string, attributes?: Record<string, string>): void {
    let tag = `<${tagName}`;
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        tag += ` ${key}="${this.escapeAttribute(value)}"`;
      }
    }
    tag += '>';
    this.parts.push(tag);
  }

  /**
   * Write a closing tag
   */
  writeCloseTag(tagName: string): void {
    this.parts.push(`</${tagName}>`);
  }

  /**
   * Write a self-closing tag
   */
  writeSelfClosingTag(tagName: string, attributes?: Record<string, string>): void {
    let tag = `<${tagName}`;
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        tag += ` ${key}="${this.escapeAttribute(value)}"`;
      }
    }
    tag += ' />';
    this.parts.push(tag);
  }

  /**
   * Write escaped text content
   */
  writeText(text: string): void {
    this.parts.push(this.escapeText(text));
  }

  /**
   * Get the accumulated HTML as a string
   */
  toString(): string {
    return this.parts.join('');
  }

  /**
   * Clear all accumulated parts
   */
  clear(): void {
    this.parts = [];
  }

  /**
   * Escape HTML text content
   */
  private escapeText(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Escape HTML attribute values
   */
  private escapeAttribute(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
