import { make31BitId } from "./make31bitid.js";
import { YBody } from "./YBody.js";
import { YCommentThread } from "./YCommentThread.js";

export class YComment {
  private thread: YCommentThread;
  public id: string;
  public body: YBody;

  public constructor(thread: YCommentThread, body: YBody) {
    this.id = make31BitId();
    this.thread = thread;
    this.body = body;
  }
}

