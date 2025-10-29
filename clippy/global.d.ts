// Global type declarations
// Note: ipCursor and clippyFloat are now managed through EditorContext
// and are no longer attached to window

declare global {
  interface Window {
    // Reserved for future use
  }

  // CSS Custom Highlight API
  interface Highlight {
    add(range: AbstractRange): void;
    clear(): void;
    delete(range: AbstractRange): boolean;
    entries(): IterableIterator<[AbstractRange, AbstractRange]>;
    forEach(callback: (range: AbstractRange, range2: AbstractRange, highlight: Highlight) => void): void;
    has(range: AbstractRange): boolean;
    keys(): IterableIterator<AbstractRange>;
    values(): IterableIterator<AbstractRange>;
    size: number;
    priority: number;
  }

  var Highlight: {
    prototype: Highlight;
    new(...ranges: AbstractRange[]): Highlight;
  };

  interface HighlightRegistry {
    set(name: string, highlight: Highlight): void;
    get(name: string): Highlight | undefined;
    delete(name: string): boolean;
    clear(): void;
    has(name: string): boolean;
    entries(): IterableIterator<[string, Highlight]>;
    forEach(callback: (highlight: Highlight, name: string, registry: HighlightRegistry) => void): void;
    keys(): IterableIterator<string>;
    values(): IterableIterator<Highlight>;
    size: number;
  }

  interface CSS {
    highlights: HighlightRegistry;
  }
}

export { }
