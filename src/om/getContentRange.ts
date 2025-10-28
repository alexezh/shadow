import { Session } from "../server/session.js";
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
    console.log(`getContentRange [start: ${args.start_para}] [end: ${args.end_para}]`);
    // Get the main body from the YDoc
    const body = session.doc.getBody();

    // If no range specified, return first 100 nodes
    if (!args.start_para && !args.end_para) {
      const children = body.getChildren();
      const selectedNodes = children.slice(0, 100);
      const htmlOutput = selectedNodes.map(node => makeHtml(node)).join('\n');
      return htmlOutput;
    }

    const startNode = session.doc.getNodeById(args.start_para!);
    if (!startNode) {
      throw "start paragraph not found"
    }

    let htmlOutput: string[] = [];

    for (let child of startNode.parent!.getChildrenRange({ startElement: args.start_para, endElement: args.end_para })) {
      htmlOutput.push(makeHtml(child));
    }

    return htmlOutput.join("\n");
  } catch (error: any) {
    throw error;
  }
}
