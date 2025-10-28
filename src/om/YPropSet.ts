import { fnv1aSeed, fnv1aStep, hashString, hashValue } from "./fnv1a.js";

/**
 * WPropSet - Set of CSS properties stored as key-value pairs
 */
export class YPropSet {
  private props: { [key: string]: any };
  private cachedHash: number | null = null;

  private constructor(props: { [key: string]: any }) {
    this.props = props;
  }

  public static create(props: { [key: string]: any }): YPropSet {
    let s = new YPropSet(props);
    return YPropCache.instance.getOrCreate(s);
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

  propsInternal(): { [key: string]: any } {
    return this.props;
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

/**
 * WPropStore - Maintains a map of int ID to WPropSet
 */
export class YPropCache {
  private store: Map<number, WeakRef<YPropSet>>;
  public static instance: YPropCache = new YPropCache()

  constructor() {
    this.store = new Map();
  }

  update(set: YPropSet, func: (props: { [key: string]: any }) => void): YPropSet {
    let newProps = { ...set }
    func(newProps);
    return YPropSet.create(newProps);
  }

  /**
   * Create a new property set and return its ID
   */
  add(propSet: YPropSet): number {
    let id = propSet.getHash();
    this.store.set(id, new WeakRef(propSet));
    return id;
  }

  /**
   * Get or create ID for a property set
   * Finds existing property set with same hash, or creates new one
   */
  getOrCreate(propSet: YPropSet): YPropSet {
    const hash = propSet.getHash();
    const curRef = this.store.get(hash);
    if (curRef) {
      const cur = curRef.deref()
      if (cur) {
        return cur;
      }
    }
    // Search for existing property set with same hash
    // No match found, create new entry
    this.add(propSet);
    return propSet;
  }
}
