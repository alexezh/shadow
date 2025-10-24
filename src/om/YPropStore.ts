import { YPropSet } from './YPropSet.js';

/**
 * WPropStore - Maintains a map of int ID to WPropSet
 */
export class YPropStore {
  private store: Map<number, YPropSet>;

  constructor() {
    this.store = new Map();
  }

  /**
   * Create a new property set and return its ID
   */
  add(propSet: YPropSet): number {
    let id = propSet.getHash();
    this.store.set(id, propSet || new YPropSet());
    return id;
  }

  /**
   * Get property set by ID
   */
  get(id: number): YPropSet | undefined {
    return this.store.get(id);
  }

  /**
   * Set property set for given ID
   */
  set(id: number, propSet: YPropSet): void {
    this.store.set(id, propSet);
  }

  /**
   * Check if ID exists
   */
  has(id: number): boolean {
    return this.store.has(id);
  }

  /**
   * Delete property set by ID
   */
  delete(id: number): boolean {
    return this.store.delete(id);
  }

  /**
   * Get or create ID for a property set
   * Finds existing property set with same hash, or creates new one
   */
  getOrCreate(propSet: YPropSet): YPropSet {
    const hash = propSet.getHash();
    const cur = this.get(hash);
    if (cur) {
      return cur;
    }
    // Search for existing property set with same hash
    // No match found, create new entry
    this.add(propSet);
    return propSet;
  }
}
