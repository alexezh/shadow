import { make31BitId } from "../om/make31bitid.js";
import { loadHtml } from "../om/loadHtml.js";
import { makeHtml } from "../om/makeHtml.js";
import { YNode, YTextContainer } from "../om/YNode.js";
import { YPara } from "../om/YPara.js";
import { YPropSet } from "../om/YPropSet.js";
import { YStr } from "../om/YStr.js";
import { ContentChangeRecord } from "../server/messages.js";
import { Session } from "../server/session.js";

/**
 * we always replace range at single level
 */
export async function replaceContentRange(
  session: Session,
  args: {
    docid: string;
    format: string;
    start_para?: string;
    end_para?: string;
    html: string;
  }): Promise<string> {
  console.log(`replaceContentRange [start: ${args.start_para}] [end: ${args.end_para}]`);

  const startNode = session.doc.getBodyPart().getNodeById(args.start_para!);
  if (!startNode) {
    throw "start paragraph not found"
  }

  let useText = false;
  let loaded: YNode[];
  try {
    // Attempt to parse as HTML (pass styleStore for CSS extraction)
    let parsed = loadHtml(args.html);
    if (parsed instanceof YTextContainer) {
      loaded = parsed.getChildren() as YNode[];
    } else if (parsed instanceof YPara) {
      loaded = [parsed];
    }
  } catch (error) {
    // If HTML parsing fails, treat as plain text
    useText = true;
  }

  // If HTML parsing failed or yielded no paragraphs, treat as plain text
  if (useText) {
    // Split plain text by newlines to create multiple paragraphs
    const lines = args.html.split('\n');
    loaded = lines.map(line => {
      const para = new YPara(make31BitId(), YPropSet.create({}), new YStr(line));
      return para;
    });
  }

  let idxStart = 0;
  let idxEnd = 0;

  let idx = 0;
  const parent = startNode.parent;
  for (let child of parent!.getChildren()) {
    if (child.id === args.start_para) {
      idxStart = idx;
    }
    if (child.id === args.end_para) {
      idxEnd = idx;
    }
    idx++;
  }
  parent!.spliceChildren(idxStart, idxEnd - idxStart, ...loaded!);

  const changeRecords: ContentChangeRecord[] = [];
  for (let item of loaded!) {
    const html = makeHtml(item);
    changeRecords.push({
      id: item.id,
      html: html,
      op: "changed"
    })
  }

  //session

  // TODO: Implement content range replacement
  return "replaceContentRange not yet implemented";
}