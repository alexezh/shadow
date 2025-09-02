import * as fs from 'fs/promises';
import * as path from 'path';

export interface FindRangeResult {
  start_para: string | null;
  end_para: string | null;
  start_line: number;
  end_line: number;
  content: string;
  matched_terms: string[];
}

export interface FindRangeOptions {
  name: string;
  format: string;
  terms: string[];
  context_lines?: number;
}

export async function findRanges(options: FindRangeOptions): Promise<{
  document: string;
  format: string;
  search_terms: string[];
  ranges_found: number;
  ranges: FindRangeResult[];
}> {
  const contentDir = path.join(process.cwd(), 'content');
  const extension = options.format === 'html' ? 'html' : 'txt';
  const filePath = path.join(contentDir, `${options.name}.${extension}`);
  const contextLines = options.context_lines || 0;

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    
    const ranges: FindRangeResult[] = [];

    let currentRange: {
      start_line: number;
      end_line: number;
      matched_terms: Set<string>;
      paragraphs: Array<{ line: number, id: string | null }>;
    } | null = null;

    // Search through each line for matching terms
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      const matchedTerms = options.terms.filter(term => line.includes(term.toLowerCase()));

      if (matchedTerms.length > 0) {
        // Extract paragraph ID from line if it exists
        const idMatch = lines[i].match(/\{id=([^}]+)\}/);
        const paraId = idMatch ? idMatch[1] : null;

        if (currentRange === null) {
          // Start new range
          currentRange = {
            start_line: Math.max(0, i - contextLines),
            end_line: Math.min(lines.length - 1, i + contextLines),
            matched_terms: new Set(matchedTerms),
            paragraphs: [{ line: i, id: paraId }]
          };
        } else {
          // Extend current range if close enough
          const extendedEnd = Math.min(lines.length - 1, i + contextLines);
          if (i - currentRange.end_line <= contextLines * 2 + 1) {
            // Extend existing range
            currentRange.end_line = extendedEnd;
            matchedTerms.forEach(term => currentRange!.matched_terms.add(term));
            if (paraId) {
              currentRange.paragraphs.push({ line: i, id: paraId });
            }
          } else {
            // Finish current range and start new one
            addRangeToResults(ranges, currentRange, lines);
            currentRange = {
              start_line: Math.max(0, i - contextLines),
              end_line: extendedEnd,
              matched_terms: new Set(matchedTerms),
              paragraphs: [{ line: i, id: paraId }]
            };
          }
        }
      }
    }

    // Add final range if exists
    if (currentRange !== null) {
      addRangeToResults(ranges, currentRange, lines);
    }

    return {
      document: options.name,
      format: options.format,
      search_terms: options.terms,
      ranges_found: ranges.length,
      ranges: ranges
    };

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`Document '${options.name}.${extension}' not found in content directory`);
    }
    throw error;
  }
}

function addRangeToResults(
  ranges: FindRangeResult[],
  currentRange: {
    start_line: number;
    end_line: number;
    matched_terms: Set<string>;
    paragraphs: Array<{ line: number, id: string | null }>;
  },
  lines: string[]
): void {
  const rangeContent = lines.slice(currentRange.start_line, currentRange.end_line + 1);
  
  // Find first and last paragraph IDs in the range
  const firstPara = currentRange.paragraphs.find(p => p.id !== null);
  const lastPara = currentRange.paragraphs.reverse().find(p => p.id !== null);

  ranges.push({
    start_para: firstPara?.id || null,
    end_para: lastPara?.id || null,
    start_line: currentRange.start_line,
    end_line: currentRange.end_line,
    content: rangeContent.join('\n'),
    matched_terms: Array.from(currentRange.matched_terms)
  });
}