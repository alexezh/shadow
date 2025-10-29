import { make31BitId } from "../make31bitid.js";
import { YBody } from "./YBody.js";
import { YComment } from "./YComment.js";
import type { YDoc } from "./YDoc.js";
import { YPropSet } from "./YPropSet.js";

export class YCommentThread {
  public doc: YDoc;
  public comments: YComment[] = [];
  public readonly id: string;
  public constructor(doc: YDoc) {
    this.id = make31BitId();
    this.doc = doc;
  }

  public createComment(): YComment {
    let comment = new YComment(this, new YBody(make31BitId(), YPropSet.create({})))
    this.comments.push(comment);
    return comment;
  }
}

