import type { Database } from "../database.js";
import type { YDoc } from "../om/YDoc.js";
import { ToolDispatcher } from "../openai/tooldispatcher.js";
import { SkillVM } from "../skills/skillvm.js";
import { SkillVMImpl } from "../skills/skillvmimpl.js";
import type { AgentChange, ConsoleResult, ContentChangeRecord, GetChangesResponse, PartId } from "./messages.js";
import type { Session } from "./session.js";

export class SessionImpl implements Session {
  public id: string;
  public createdAt: Date = new Date();
  public pendingChanges: GetChangesResponse[] = [];
  public changeResolvers: Array<(changes: GetChangesResponse[]) => void> = [];
  public doc: YDoc;
  public database: Database;
  public currentPartId: string;
  public vm: SkillVM;

  public constructor(
    database: Database,
    id: string,
    doc: YDoc,
    currentPartId: string = 'main'
  ) {
    this.id = id;
    this.doc = doc;
    this.vm = new SkillVMImpl(this, new ToolDispatcher(database))
    this.database = database;
    this.currentPartId = currentPartId;
  }

  private notifyChangeListeners(): void {

    // Resolve all waiting requests with the pending changes
    while (this.changeResolvers.length > 0) {
      const resolve = this.changeResolvers.shift();
      if (resolve) {
        const changes = this.pendingChanges.splice(0);
        resolve(changes);
      }
    }
  }

  public sendUpdate(sessionId: string, partId: PartId, changeRecords: ContentChangeRecord[]) {
    const data: AgentChange = {
      sessionId,
      partId,
      changes: changeRecords
    }
    const response: GetChangesResponse = {
      kind: "agent",
      data: data
    };
    this.pendingChanges.push(response);
    this.notifyChangeListeners();
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
