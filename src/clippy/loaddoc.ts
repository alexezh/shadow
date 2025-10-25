import { make31BitId } from "../make31bitid.js";
import { loadHtml } from "../om/loadHtml.js";
import { makeHtml } from "../om/makeHtml.js";
import { YDoc } from "../om/YDoc.js";
import { YPara } from "../om/YPara.js";
import { YPropSet } from "../om/YPropSet.js";
import { YStr } from "../om/YStr.js";
import { Session } from "./session.js";

export function loadDoc(session: Session | undefined, htmlContent: string): string {
  if (!session) {
    return "not supported";
  }

  // Parse HTML and load into document
  const rootNode = loadHtml(htmlContent);

  // Clear existing body and add new content
  const body = session.doc.getBody();
  const children = body.getChildren();
  while (children.length > 0) {
    body.removeChild(0);
  }

  // Add the loaded node as a child
  let nodeCount = 0;
  if (rootNode.hasChildren()) {
    const loadedChildren = rootNode.getChildren();
    if (loadedChildren) {
      for (const child of loadedChildren) {
        body.addChild(child);
        nodeCount++;
      }
    }
  } else {
    body.addChild(rootNode);
    nodeCount = 1;
  }

  // Generate HTML for the entire document
  const newHtml = makeHtml(body);

  // Create a change to update the entire document
  session.pendingChanges.push({
    changes: [{
      id: 'doc-content',
      html: newHtml,
      op: "inserted"
    }]
  });

  return `Document loaded successfully. ${nodeCount} nodes added.`;
}

export function makeDefaultDoc(): YDoc {
  const doc = new YDoc();

  // Create default document with placeholder paragraph
  const body = doc.getBody();
  const para = new YPara(make31BitId(), YPropSet.create({}), new YStr('Document content will appear here. Click to position cursor.\n'))
  body.addChild(para);
  return doc;
}