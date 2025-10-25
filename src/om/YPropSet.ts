import { fnv1aSeed, fnv1aStep, hashString, hashValue } from "./fnv1a.js";
import type { YPropStore } from "./YPropStore.js";

/**
 * WPropSet - Set of CSS properties stored as key-value pairs
 */
export class YPropSet {
  private _store: YPropStore;
  private props: { [key: string]: any };
  private cachedHash: number | null = null;

  private constructor(propStore: YPropStore, props: { [key: string]: any }) {
    this._store = propStore;
    this.props = props;
  }

  public static create(propStore: YPropStore, props: { [key: string]: any }): YPropSet {
    let s = new YPropSet(propStore, props);
    return propStore.getOrCreate(s);
  }

  get(key: string): any {
    return this.props[key];
  }

  has(key: string): boolean {
    return key in this.props;
  }

  entries(): Array<[string, any]> {
    return Object.entries(this.props);
  }

  /**
   * Returns a 32-bit hash value for this property set (cached)
   */
  getHash(): number {
    if (this.cachedHash != null) return this.cachedHash;

    // 1) Collect keys (CSS-like ASCII), 2) sort with default lex order (faster than localeCompare),
    // 3) stream hash: key + ':' + value (typed hashing, no JSON stringify).
    const props = this.props as Record<string, unknown>;
    const keys = Object.keys(props);
    keys.sort(); // simple, fast, deterministic

    let h = fnv1aSeed(); // FNV-1a 32-bit offset basis
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      h = hashString(h, k);
      h = fnv1aStep(h, 0x3A); // ':'
      h = hashValue(h, props[k]);
      h = fnv1aStep(h, 0x7C); // '|' field sep
    }

    // keep it positive 31-bit if you specifically need that
    this.cachedHash = h & 0x7fffffff;
    return this.cachedHash;
  }
}
