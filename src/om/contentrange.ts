import { Session } from "../clippy/session.js";
import { makeHtml } from "./makeHtml.js";
import { YNode } from "./YNode.js";

export async function getContentRange(session: Session,
  args: {
    docid: string;
    format: string;
    start_para?: string;
    end_para?: string;
  }): Promise<string> {
  try {
    // Get the main body from the YDoc
    const body = session.doc.getBody();
    const children = body.getChildren();

    // If no range specified, return first 100 nodes
    if (!args.start_para && !args.end_para) {
      const selectedNodes = children.slice(0, 100);
      const htmlOutput = selectedNodes.map(node => makeHtml(node)).join('\n');
      return htmlOutput;
    }

    // Find start and end indices based on node IDs
    let startIndex = 0;
    let endIndex = children.length - 1;

    if (args.start_para) {
      const foundIndex = children.findIndex(node => node.id === args.start_para);
      if (foundIndex !== -1) {
        startIndex = foundIndex;
      }
    }

    if (args.end_para) {
      const foundIndex = children.findIndex(node => node.id === args.end_para);
      if (foundIndex !== -1) {
        endIndex = foundIndex;
      }
    }

    // Extract the range (max 100 nodes)
    const selectedNodes = children.slice(startIndex, Math.min(endIndex + 1, startIndex + 100));
    const htmlOutput = selectedNodes.map(node => makeHtml(node)).join('\n');

    return htmlOutput;
  } catch (error: any) {
    throw error;
  }
}
