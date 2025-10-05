import path from "path";
import * as fs from 'fs/promises';

async function resolveFilePath(contentDir: string, name: string): Promise<string | null> {
  // If name already has .html extension, use it as is
  if (name.endsWith('.html')) {
    const filePath = path.join(contentDir, name);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      return null;
    }
  }

  // Try different extensions in order
  const extensionsToTry = [
    '', // Try as-is first
    '.html',
    '.output.html'
  ];

  for (const ext of extensionsToTry) {
    const filePath = path.join(contentDir, `${name}${ext}`);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // File doesn't exist, try next extension
      continue;
    }
  }

  return null;
}

export async function getContentRange(args: {
  name: string;
  format: string;
  start_para?: string;
  end_para?: string;
}): Promise<string> {
  const contentDir = path.join(process.cwd(), 'content');
  const filePath = await resolveFilePath(contentDir, args.name);

  if (!filePath) {
    return `Document '${args.name}' not found in content directory (tried: ${args.name}, ${args.name}.html, ${args.name}.output.html)`;
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // If no range specified, return full content
    if (!args.start_para && !args.end_para) {
      return content;
    }

    // Extract range based on paragraph IDs
    const lines = content.split('\n');
    let startIndex = 0;
    let endIndex = lines.length - 1;

    // Find start paragraph index
    if (args.start_para) {
      const startFound = lines.findIndex(line => line.includes(`{id=${args.start_para}}`));
      if (startFound !== -1) {
        startIndex = startFound;
      }
    }

    // Find end paragraph index
    if (args.end_para) {
      const endFound = lines.findIndex(line => line.includes(`{id=${args.end_para}}`));
      if (endFound !== -1) {
        endIndex = endFound;
      }
    }

    // Extract the range
    const rangeLines = lines.slice(startIndex, endIndex + 1);

    // Set current range for future reference
    //this.setCurrentRange(args.name, args.format, args.start_para, args.end_para, startIndex, endIndex);

    return rangeLines.join('\n');
  } catch (error: any) {
    throw error;
  }
}
