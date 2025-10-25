import { make31BitId } from "../make31bitid";
import { YPropSet } from "./YPropSet";

/**
 * WStr - Maintains string content with newlines and array of int IDs to property sets
 */
export class YStr {
  private _text: string;
  private props: YPropSet[]; // Array of property set IDs, one per character
  private cachedHash: number | null = null;

  public get text(): string {
    return this._text;
  }

  public get length(): number {
    return this._text.length;
  }

  constructor(text: string = '', props?: YPropSet[]) {
    this._text = text;
    this.props = props || new Array(text.length).fill(0);
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
      return this.props[this.props.length + index];
    } else {
      return this.props[index];
    }
  }

  /**
   * Set property ID at given position
   */
  setPropAt(index: number, props: YPropSet): void {
    if (index >= 0 && index < this.props.length) {
      this.props[index] = props;
      this.invalidateHash();
    }
  }

  /**
   * Set property ID for a range
   */
  setPropsRange(start: number, end: number, props: YPropSet): void {
    for (let i = start; i < end && i < this.props.length; i++) {
      this.props[i] = props;
    }
    this.invalidateHash();
  }

  /**
   * Append text with property ID
   */
  append(text: string, props: YPropSet): void {
    this._text += text;
    for (let i = 0; i < text.length; i++) {
      this.props.push(props);
    }
    this.invalidateHash();
  }

  appendY(str: YStr): void {
    this._text += str._text;
    this.props.splice(this.props.length - 1, 0, ...str.props);
    this.invalidateHash();
  }

  /**
   * Insert text at position with property ID
   */
  insertAt(index: number, text: string, prop: YPropSet): void {
    this._text = this._text.slice(0, index) + text + this._text.slice(index);
    const newPropIds = new Array<YPropSet>(text.length).fill(prop);
    this.props.splice(index, 0, ...newPropIds);
    this.invalidateHash();
  }

  split(index: number): YStr {
    const offset = Math.max(0, Math.min(index, this._text.length));

    // Split the string at cursor position
    const secondText = this._text.substring(offset);
    const secondProp = this.props.slice(offset);

    const newStr = new YStr(secondText, secondProp);

    this.delete(offset, secondText.length);
    return newStr;
  }

  /**
   * Delete text from start to end
   */
  delete(start: number, count: number): void {
    this._text = this._text.slice(0, start) + this._text.slice(start + count);
    this.props.splice(start, count);
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
      for (let i = 0; i < this.props.length; i++) {
        hash = ((hash << 5) - hash) + this.props[i].getHash();
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
    return this.props;
  }
}
