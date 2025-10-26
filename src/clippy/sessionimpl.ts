import type { YDoc } from "../om/YDoc.js";
import type { ActionResult, Session } from "./session.js";

export class SessionImpl implements Session {
  public id: string;
  public createdAt: Date = new Date();
  public pendingChanges: ActionResult[] = [];
  public changeResolvers: Array<(changes: any[]) => void> = [];
  public doc: YDoc;
  public currentPartId: string;

  public constructor(
    id: string,
    doc: YDoc,
    currentPartId: string = 'main'
  ) {
    this.id = id;
    this.doc = doc;
    this.currentPartId = currentPartId;
  }
}
