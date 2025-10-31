import type { YDoc } from "./YDoc.js";
import { YNode, YTextContainer } from "./YNode.js";
import { YRange } from "./YRange.js";
import { YPara } from "./YPara.js";
import { YBody } from "./YBody.js";
import { YStr } from "./YStr.js";
import { YPropSet } from "./YPropSet.js";
import { make31BitId } from "./make31bitid.js";
import { YTable } from "./YTable.js";
import { YRow } from "./YRow.js";
import { YCell } from "./YCell.js";

/**
 * Deep copy a YNode and all its children
 */
function deepCopyNode(node: YNode): YNode {
  if (node instanceof YPara) {
    // Copy paragraph: create new YStr with copied text and attrs
    const text = node.getText();
    const attrs = node.getTextAttrs();
    const newStr = new YStr(text, [...attrs]);
    const newId = make31BitId();
    return new YPara(newId, node.props, newStr);
  } else if (node instanceof YTable) {
    // Copy table: recursively copy all rows
    const newId = make31BitId();
    const newTable = new YTable(newId, node.props);
    const children = node.getChildren();
    if (children) {
      for (const child of children) {
        const copiedChild = deepCopyNode(child);
        newTable.addChild(copiedChild);
      }
    }
    return newTable;
  } else if (node instanceof YRow) {
    // Copy row: recursively copy all cells
    const newId = make31BitId();
    const newRow = new YRow(newId, node.props);
    const children = node.getChildren();
    if (children) {
      for (const child of children) {
        const copiedChild = deepCopyNode(child);
        newRow.addChild(copiedChild);
      }
    }
    return newRow;
  } else if (node instanceof YCell) {
    // Copy cell: recursively copy all children
    const newId = make31BitId();
    const newCell = new YCell(newId, node.props);
    const children = node.getChildren();
    if (children) {
      for (const child of children) {
        const copiedChild = deepCopyNode(child);
        newCell.addChild(copiedChild);
      }
    }
    return newCell;
  } else if (node instanceof YBody) {
    // Copy body: recursively copy all children
    const newId = make31BitId();
    const newBody = new YBody(newId, node.props);
    const children = node.getChildren();
    if (children) {
      for (const child of children) {
        const copiedChild = deepCopyNode(child);
        newBody.addChild(copiedChild);
      }
    }
    return newBody;
  } else {
    throw new Error(`Cannot copy node type: ${node.constructor.name}`);
  }
}

/**
 * Copy a range of nodes and return a new YBody containing the copies
 */
export function copyRange(doc: YDoc, range: YRange): YBody {
  const startNode = doc.getBodyPart().getNodeById(range.startElement);
  if (!startNode) {
    throw new Error(`Start node not found: ${range.startElement}`);
  }

  const endNode = doc.getBodyPart().getNodeById(range.endElement);
  if (!endNode) {
    throw new Error(`End node not found: ${range.endElement}`);
  }

  // Create a new body to hold the copied nodes
  const newBody = new YBody(make31BitId(), YPropSet.create({}));

  // Get the parent container of the start node
  const parent = startNode.parent;
  if (!parent) {
    throw new Error('Start node has no parent');
  }

  // Iterate through nodes in the range
  for (const node of parent.getChildrenRange({
    startElement: range.startElement,
    endElement: range.endElement
  })) {
    const copiedNode = deepCopyNode(node);
    newBody.addChild(copiedNode);
  }

  return newBody;
}
