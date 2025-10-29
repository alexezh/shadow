import { make31BitId } from "../make31bitid.js";
import { YBody } from "./YBody.js";
import { type YDoc, YDocPart } from "./YDoc.js";
import { YPropCache, YPropSet } from "./YPropSet.js";

export class YComment extends YDocPart {
  public constructor(doc: YDoc, body: YBody) {
    super(doc, make31BitId(), "comment", "", body)
  }
}

