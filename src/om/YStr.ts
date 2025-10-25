import { YPropSet } from "./YPropSet.js";

/**
 * WStr - Maintains string content with newlines and array of int IDs to property sets
 */
export class YStr {
  private _text: string;
  private attrs: YPropSet[]; // Array of property set IDs, one per character
  private cachedHash: number | null = null;

  public get text(): string {
    return this._text;
  }

  public get length(): number {
    return this._text.length;
  }

  constructor(text?: string, attrs?: YPropSet | YPropSet[]) {
    this._text = text ?? '';
    this.attrs = new Array<YPropSet>(this._text.length);
    if (this.attrs.length > 0) {
      if (Array.isArray(attrs)) {
        this.attrs = [...attrs];
      } else {
        this.attrs.fill(attrs ?? YPropSet.create({}));
      }
    }
  }

  private invalidateHash(): void {
    this.cachedHash = null;
  }

  getCharAt(index: number): string {
    if (index < 0) {
      return this._text[this._text.length + index];
    } else {
      return this._text[index];
    }
  }

  /**
   * Get property ID at given position
   */
  getPropsAt(index: number): YPropSet {
    if (index < 0) {
      return this.attrs[this.attrs.length + index];
    } else {
      return this.attrs[index];
    }
  }

  /**
   * Set property ID at given position
   */
  setPropAt(index: number, props: YPropSet): void {
    if (index >= 0 && index < this.attrs.length) {
      this.attrs[index] = props;
      this.invalidateHash();
    }
  }

  /**
   * Set property ID for a range
   */
  setPropsRange(start: number, end: number, props: YPropSet): void {
    for (let i = start; i < end && i < this.attrs.length; i++) {
      this.attrs[i] = props;
    }
    this.invalidateHash();
  }

  /**
   * Append text with property ID
   */
  append(text: string, props: YPropSet): void {
    this._text += text;
    for (let i = 0; i < text.length; i++) {
      this.attrs.push(props);
    }
    this.invalidateHash();
  }

  appendY(str: YStr): void {
    this._text += str._text;
    this.attrs.splice(this.attrs.length - 1, 0, ...str.attrs);
    this.invalidateHash();
  }

  /**
   * Insert text at position with property ID
   */
  insertAt(index: number, text: string, prop: YPropSet): void {
    this._text = this._text.slice(0, index) + text + this._text.slice(index);
    const newPropIds = new Array<YPropSet>(text.length).fill(prop);
    this.attrs.splice(index, 0, ...newPropIds);
    this.invalidateHash();
  }

  split(index: number): YStr {
    const offset = Math.max(0, Math.min(index, this._text.length));

    // Split the string at cursor position
    const secondText = this._text.substring(offset);
    const secondProp = this.attrs.slice(offset);

    const newStr = new YStr(secondText, secondProp);

    this.delete(offset, secondText.length);
    return newStr;
  }

  /**
   * Delete text from start to end
   */
  delete(start: number, count: number): void {
    this._text = this._text.slice(0, start) + this._text.slice(start + count);
    this.attrs.splice(start, count);
    this.invalidateHash();
  }

  /**
   * Returns a 32-bit hash value for this string (cached)
   */
  getHash(): number {
    if (this.cachedHash === null) {
      let hash = 0;

      // Hash the text content
      for (let i = 0; i < this._text.length; i++) {
        const char = this._text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & 0x7FFFFFFF; // Keep it 31-bit positive
      }

      // Hash the property IDs
      for (let i = 0; i < this.attrs.length; i++) {
        hash = ((hash << 5) - hash) + this.attrs[i].getHash();
        hash = hash & 0x7FFFFFFF;
      }

      this.cachedHash = hash;
    }

    return this.cachedHash;
  }

  /**
   * Get all property IDs
   */
  getProps(): ReadonlyArray<YPropSet> {
    return this.attrs;
  }
}
