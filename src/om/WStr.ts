/**
 * WStr - Maintains string content with newlines and array of int IDs to property sets
 */
export class WStr {
  private text: string;
  private propIds: number[]; // Array of property set IDs, one per character

  constructor(text: string = '', propIds?: number[]) {
    this.text = text;
    this.propIds = propIds || new Array(text.length).fill(0);
  }

  /**
   * Get the text content
   */
  getText(): string {
    return this.text;
  }

  /**
   * Get the length of the string
   */
  getLength(): number {
    return this.text.length;
  }

  /**
   * Get property ID at given position
   */
  getPropIdAt(index: number): number {
    if (index < 0 || index >= this.propIds.length) {
      return 0;
    }
    return this.propIds[index];
  }

  /**
   * Set property ID at given position
   */
  setPropIdAt(index: number, propId: number): void {
    if (index >= 0 && index < this.propIds.length) {
      this.propIds[index] = propId;
    }
  }

  /**
   * Set property ID for a range
   */
  setPropIdRange(start: number, end: number, propId: number): void {
    for (let i = start; i < end && i < this.propIds.length; i++) {
      this.propIds[i] = propId;
    }
  }

  /**
   * Append text with property ID
   */
  append(text: string, propId: number = 0): void {
    this.text += text;
    for (let i = 0; i < text.length; i++) {
      this.propIds.push(propId);
    }
  }

  /**
   * Insert text at position with property ID
   */
  insert(index: number, text: string, propId: number = 0): void {
    this.text = this.text.slice(0, index) + text + this.text.slice(index);
    const newPropIds = new Array(text.length).fill(propId);
    this.propIds.splice(index, 0, ...newPropIds);
  }

  /**
   * Delete text from start to end
   */
  delete(start: number, end: number): void {
    this.text = this.text.slice(0, start) + this.text.slice(end);
    this.propIds.splice(start, end - start);
  }

  /**
   * Returns a 32-bit hash value for this string
   */
  getHash(): number {
    let hash = 0;

    // Hash the text content
    for (let i = 0; i < this.text.length; i++) {
      const char = this.text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & 0x7FFFFFFF; // Keep it 31-bit positive
    }

    // Hash the property IDs
    for (let i = 0; i < this.propIds.length; i++) {
      hash = ((hash << 5) - hash) + this.propIds[i];
      hash = hash & 0x7FFFFFFF;
    }

    return hash;
  }

  /**
   * Get all property IDs
   */
  getPropIds(): number[] {
    return this.propIds;
  }
}
