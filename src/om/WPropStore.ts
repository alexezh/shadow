import { WPropSet } from './WPropSet.js';

/**
 * WPropStore - Maintains a map of int ID to WPropSet
 */
export class WPropStore {
  private store: Map<number, WPropSet>;
  private nextId: number;

  constructor() {
    this.store = new Map();
    this.nextId = 1;
  }

  /**
   * Create a new property set and return its ID
   */
  create(propSet?: WPropSet): number {
    const id = this.nextId++;
    this.store.set(id, propSet || new WPropSet());
    return id;
  }

  /**
   * Get property set by ID
   */
  get(id: number): WPropSet | undefined {
    return this.store.get(id);
  }

  /**
   * Set property set for given ID
   */
  set(id: number, propSet: WPropSet): void {
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
  getOrCreateId(propSet: WPropSet): number {
    const hash = propSet.getHash();

    // Search for existing property set with same hash
    for (const [id, existingPropSet] of this.store.entries()) {
      if (existingPropSet.getHash() === hash) {
        // Found matching property set
        return id;
      }
    }

    // No match found, create new entry
    return this.create(propSet);
  }
}
