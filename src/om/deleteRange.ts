import type { YDoc } from "./YDoc.js";
import { YRange, YNode } from "./YNode.js";
import { YPara } from "./YPara.js";

export function deleteRange(doc: YDoc, range: YRange): { node: YNode, op: "changed" | "deleted" }[] {
  const body = doc.getBody();
  const node = doc.getNodeById(range.startElement);

  if (!node || !(node instanceof YPara)) {
    return [];
  }

  // Check if there's a selection (range spans multiple characters)
  if (range.startElement === range.endElement) {
    // Delete the selected range
    const start = Math.min(range.startOffset, range.endOffset);
    const end = Math.max(range.startOffset, range.endOffset);

    (node as YPara).deleteRange(start, end);

    return [{ node, op: "changed" }];
  }

  const toDelete = [...node.parent!.getChildrenRange(range)];
  if (toDelete.length > 1) {
    const idx = node.parent!.indexOf(node);
    node.parent!.spliceChildren(idx + 1, toDelete.length - 1);
  }

  const firstNode = toDelete[0];
  const lastNode = toDelete[toDelete.length - 1];
  if (firstNode instanceof YPara) {
    firstNode.deleteRange(range.startOffset + 1);
    firstNode.mergeParagraph(lastNode as YPara);
  }

  const changed: { node: YNode, op: "changed" | "deleted" }[] = []
  for (let node of toDelete) {
    if (node === firstNode) {
      changed.push({ node, op: "changed" });
    } else {
      changed.push({ node, op: "changed" });
    }
  }

  return changed;
}
