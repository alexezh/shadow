/**
 * JsonChunkedParser - Assembles JSON from streaming chunks
 *
 * Processes incoming string chunks and detects when a complete JSON object
 * has been received by tracking brace/bracket depth. Automatically handles
 * single-quote to double-quote conversion for JSON compatibility.
 *
 * Skips junk characters before the first { or [ up to maxJunkChars limit.
 */
export class JsonChunkedParser {
  private buffer: string = '';
  private depth: number = 0;
  private inString: boolean = false;
  private escaped: boolean = false;
  private started: boolean = false;
  private openChar: '{' | '[' | null = null;
  private junkChars: number = 0;
  private maxJunkChars: number;

  /**
   * @param maxJunkChars - Maximum number of characters to skip before finding { or [ (default: 200)
   */
  constructor(maxJunkChars: number = 10) {
    this.maxJunkChars = maxJunkChars;
  }

  /**
   * Process a chunk of data
   * @param chunk - String chunk to process
   * @returns Result object with completion status
   */
  process(chunk: string): JsonChunkedParserResult {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];

      // Before starting, skip junk and look for { or [
      if (!this.started) {
        if (ch === '{' || ch === '[') {
          this.started = true;
          this.openChar = ch;
          this.depth++;
          this.buffer += ch;
          continue;
        }

        // Track junk characters (whitespace is ok, other chars count toward limit)
        if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') {
          this.junkChars++;
          if (this.junkChars > this.maxJunkChars) {
            return {
              complete: true,
              error: `No JSON start found after ${this.junkChars} non-whitespace characters`
            };
          }
        }
        continue;
      }

      // Handle escape sequences inside strings
      if (this.inString) {
        if (this.escaped) {
          // Keep escaped character as-is
          this.buffer += ch;
          this.escaped = false;
          continue;
        }

        if (ch === '\\') {
          // Start escape sequence
          this.buffer += ch;
          this.escaped = true;
          continue;
        }

        if (ch === '"') {
          // End of string
          this.buffer += ch;
          this.inString = false;
          continue;
        } else if (ch === "'") {
          // End of string
          this.buffer += '"';
          this.inString = false;
          continue;
        }

        // Regular character inside string
        this.buffer += ch;
        continue;
      }

      // Not in string - process structural characters
      if (ch === '"') {
        // Start of string
        this.buffer += ch;
        this.inString = true;
        continue;
      }

      // Convert single quotes to double quotes for JSON compatibility
      // (only outside of strings)
      if (ch === "'") {
        this.buffer += '"';
        this.inString = true;
        continue;
      }

      // Track opening braces/brackets (nested ones after the first)
      if (ch === '{' || ch === '[') {
        this.depth++;
        this.buffer += ch;
        continue;
      }

      // Track closing braces/brackets
      if (ch === '}' || ch === ']') {
        this.depth--;
        this.buffer += ch;

        // Check if we've completed the top-level object
        if (this.depth === 0) {
          return this.tryParse();
        }
        continue;
      }

      // Regular character - just append (only after started)
      this.buffer += ch;
    }

    // Not complete yet
    return { complete: false };
  }

  /**
   * Try to parse the accumulated buffer
   */
  private tryParse(): JsonChunkedParserResult {
    const json = this.buffer.trim();

    try {
      const value = JSON.parse(json);
      return {
        complete: true,
        value,
        json
      };
    } catch (error) {
      return {
        complete: true,
        error: `JSON parse error: ${(error as Error).message}`,
        json
      };
    }
  }

  /**
   * Get current buffer contents
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Get current depth
   */
  getDepth(): number {
    return this.depth;
  }

  /**
   * Check if parsing has started
   */
  hasStarted(): boolean {
    return this.started;
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.buffer = '';
    this.depth = 0;
    this.inString = false;
    this.escaped = false;
    this.started = false;
    this.openChar = null;
    this.junkChars = 0;
  }

  /**
   * Get statistics about current state
   */
  getStats(): JsonChunkedParserStats {
    return {
      bufferLength: this.buffer.length,
      depth: this.depth,
      inString: this.inString,
      started: this.started,
      openChar: this.openChar,
      junkChars: this.junkChars
    };
  }
}

export interface JsonChunkedParserResult {
  complete: boolean;
  value?: any;
  json?: string;
  error?: string;
}

export interface JsonChunkedParserStats {
  bufferLength: number;
  depth: number;
  inString: boolean;
  started: boolean;
  openChar: '{' | '[' | null;
  junkChars: number;
}
