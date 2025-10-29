import type { YDoc } from "../om/YDoc.js";
import { ConsoleResult, GetChangesResponse } from "./messages.js";
import type { Session } from "./session.js";

export class SessionImpl implements Session {
  public id: string;
  public createdAt: Date = new Date();
  public pendingChanges: GetChangesResponse[] = [];
  public changeResolvers: Array<(changes: GetChangesResponse[]) => void> = [];
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

  /**
   * Send a console message to the client
   * @param html HTML content to display in the console
   */
  public sendConsole(html: string): void {
    const consoleResult: ConsoleResult = { html };
    const response: GetChangesResponse = {
      kind: "console",
      data: consoleResult
    };
    this.pendingChanges.push(response);

    // Resolve any waiting change listeners
    while (this.changeResolvers.length > 0) {
      const resolve = this.changeResolvers.shift();
      if (resolve) {
        const changes = this.pendingChanges.splice(0);
        resolve(changes);
      }
    }
  }
}
