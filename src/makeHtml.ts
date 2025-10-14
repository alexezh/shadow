import MarkdownIt from 'markdown-it';
import * as fs from 'fs/promises';
import * as path from 'path';

interface DirectiveAttributes {
  id?: string;
  class?: string;
  style?: string;
}

/**
 * Parse directive line like: ::: para {#p-1 .title style="..."}
 * Returns the tag name and attributes
 */
function parseDirective(line: string): { tag: string; attrs: DirectiveAttributes } | null {
  const match = line.match(/^:::\s+(\w+)\s*(?:\{([^}]+)\})?/);
  if (!match) return null;

  const tag = match[1];
  const attrsString = match[2] || '';
  const attrs: DirectiveAttributes = {};

  // Parse #id
  const idMatch = attrsString.match(/#([^\s.}]+)/);
  if (idMatch) {
    attrs.id = idMatch[1];
  }

  // Parse .class
  const classMatches = attrsString.matchAll(/\.([^\s#}]+)/g);
  const classes: string[] = [];
  for (const classMatch of classMatches) {
    classes.push(classMatch[1]);
  }
  if (classes.length > 0) {
    attrs.class = classes.join(' ');
  }

  // Parse style="..."
  const styleMatch = attrsString.match(/style="([^"]+)"/);
  if (styleMatch) {
    attrs.style = styleMatch[1];
  }

  return { tag, attrs };
}

/**
 * Detect if content contains tables or other block-level markdown
 */
function containsBlockElements(content: string): boolean {
  const lines = content.split('\n');

  // Check for tables (lines with |)
  if (lines.some(line => line.includes('|') && line.trim().startsWith('|'))) {
    return true;
  }

  // Check for code blocks
  if (content.includes('```')) {
    return true;
  }

  // Check for lists
  if (lines.some(line => /^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line))) {
    return true;
  }

  // Check for blockquotes
  if (lines.some(line => line.trim().startsWith('>'))) {
    return true;
  }

  return false;
}

/**
 * Convert markdown with ::: directives to HTML
 */
function convertMarkdownWithDirectives(markdown: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];
  let inDirective = false;
  let currentTag = '';
  let currentAttrs: DirectiveAttributes = {};
  let directiveContent: string[] = [];

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for directive start
    if (line.trim().startsWith(':::') && !inDirective) {
      const parsed = parseDirective(line);
      if (parsed) {
        inDirective = true;
        currentTag = parsed.tag;
        currentAttrs = parsed.attrs;
        directiveContent = [];
        continue;
      }
    }

    // Check for directive end
    if (line.trim() === ':::' && inDirective) {
      inDirective = false;

      // Process the directive content
      const content = directiveContent.join('\n').trim();

      // Determine if we should use block or inline rendering
      const hasBlockElements = containsBlockElements(content);
      const processedContent = hasBlockElements
        ? md.render(content).trim()  // Full render for tables, lists, etc.
        : md.renderInline(content);   // Inline render for simple text

      // Build the HTML element
      const attrsList: string[] = [];
      if (currentAttrs.id) {
        attrsList.push(`id="${currentAttrs.id}"`);
      }
      if (currentAttrs.class) {
        attrsList.push(`class="${currentAttrs.class}"`);
      }
      if (currentAttrs.style) {
        attrsList.push(`style="${currentAttrs.style}"`);
      }

      const attrsStr = attrsList.length > 0 ? ' ' + attrsList.join(' ') : '';

      // Use appropriate HTML tag based on directive type
      let htmlTag = 'div';
      if (currentTag === 'para' || currentTag === 'p') {
        htmlTag = 'p';
      } else if (currentTag === 'heading' || currentTag === 'h1') {
        htmlTag = 'h1';
      } else if (currentTag === 'h2') {
        htmlTag = 'h2';
      } else if (currentTag === 'h3') {
        htmlTag = 'h3';
      } else if (currentTag === 'h4') {
        htmlTag = 'h4';
      } else if (currentTag === 'section') {
        htmlTag = 'section';
      } else if (currentTag === 'article') {
        htmlTag = 'article';
      } else if (currentTag === 'aside') {
        htmlTag = 'aside';
      } else if (currentTag === 'header') {
        htmlTag = 'header';
      } else if (currentTag === 'footer') {
        htmlTag = 'footer';
      } else if (currentTag === 'table') {
        htmlTag = 'div'; // Wrapper for table
      }

      result.push(`<${htmlTag}${attrsStr}>${processedContent}</${htmlTag}>`);
      directiveContent = [];
      continue;
    }

    // Accumulate directive content
    if (inDirective) {
      directiveContent.push(line);
      continue;
    }

    // Process regular markdown lines outside directives
    if (line.trim() === '') {
      result.push('');
    } else if (line.trim() === '---') {
      result.push('<hr>');
    } else if (line.startsWith('#')) {
      // Process headings
      result.push(md.render(line).trim());
    } else if (line.match(/^\{#[^}]+\}$/)) {
      // Standalone ID markers like {#p-1} - skip or store for next element
      continue;
    } else if (line.includes('|') && line.trim().startsWith('|')) {
      // Start of a table - collect all table lines
      const tableLines = [line];
      let j = i + 1;
      while (j < lines.length && (lines[j].includes('|') || lines[j].trim() === '')) {
        if (lines[j].trim() !== '') {
          tableLines.push(lines[j]);
        }
        j++;
        if (lines[j] && !lines[j].includes('|')) break;
      }
      i = j - 1;
      const tableMarkdown = tableLines.join('\n');
      result.push(md.render(tableMarkdown).trim());
    } else if (/^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      // Start of a list - collect all list lines
      const listLines = [line];
      let j = i + 1;
      while (j < lines.length && (/^\s*[-*+]\s/.test(lines[j]) || /^\s*\d+\.\s/.test(lines[j]) || lines[j].trim() === '' || lines[j].startsWith('  '))) {
        listLines.push(lines[j]);
        j++;
        if (lines[j] && lines[j].trim() !== '' && !/^\s*[-*+]\s/.test(lines[j]) && !/^\s*\d+\.\s/.test(lines[j]) && !lines[j].startsWith('  ')) {
          break;
        }
      }
      i = j - 1;
      const listMarkdown = listLines.join('\n');
      result.push(md.render(listMarkdown).trim());
    } else {
      // Regular content - render as markdown
      const rendered = md.render(line).trim();
      if (rendered) {
        result.push(rendered);
      }
    }
  }

  return result.join('\n');
}

/**
 * Get unique filename by appending counter if file exists
 */
async function getUniqueFilename(baseDir: string, filename: string): Promise<string> {
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext);
  let counter = 0;
  let finalFilename = filename;

  while (true) {
    const fullPath = path.join(baseDir, finalFilename);
    try {
      await fs.access(fullPath);
      // File exists, try next index
      counter++;
      finalFilename = `${baseName}_${counter}${ext}`;
    } catch {
      // File doesn't exist, we can use this name
      break;
    }
  }

  return finalFilename;
}

/**
 * Main function to convert markdown file with ::: directives to HTML
 */
export async function makeHtml(inputFilename: string): Promise<string> {
  try {
    const contentDir = path.join(process.cwd(), 'content');
    const inputPath = path.join(contentDir, inputFilename);

    console.log(`📖 Reading markdown file: ${inputPath}`);
    const markdownContent = await fs.readFile(inputPath, 'utf-8');

    console.log(`🔄 Converting markdown to HTML...`);
    const htmlContent = convertMarkdownWithDirectives(markdownContent);

    // Determine output filename
    const baseName = path.basename(inputFilename, path.extname(inputFilename));
    const outputFilename = await getUniqueFilename(contentDir, `${baseName}.html`);
    const outputPath = path.join(contentDir, outputFilename);

    // Write HTML file
    await fs.writeFile(outputPath, htmlContent, 'utf-8');

    console.log(`✅ HTML file created: ${outputPath}`);
    return `Successfully converted ${inputFilename} to ${outputFilename}`;

  } catch (error) {
    console.error('❌ Error converting markdown to HTML:', error);
    throw new Error(`Failed to convert markdown to HTML: ${error}`);
  }
}
