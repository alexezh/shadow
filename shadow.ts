import {
  type ShadowMessageArgs,
  type ShadowMessageId,
  ShadowMessage,
} from "./shadowmessage";
import type { IShadow, IShadowTextBody } from "./ishadow";
import type { IShadowAgent, AgentName } from "./ishadowagent";
import { TypingAgent } from "./typingagent";
import { FormattingAgent } from "./formattingagent";
import { AddTocAgent } from "./addtocagent";

/**
 * manages set of states which are changed based on actions
 * a state can depend on other states (which at the end all action based)
 *
 * the overall idea is to translate individual actions such as user typing
 * into states such as "writing" when user is adding new content, or "editing" for
 * changing existing content or "correcting". Unlike traditional state machines, states
 * are probabilistic and can exist at the same time.
 *
 * initially state compute is heuristic based, but can be replaced with small model
 */
export class Shadow implements IShadow {
  private readonly actions: ShadowMessage[] = [];
  private readonly agents: Map<AgentName, IShadowAgent> = new Map<
    AgentName,
    IShadowAgent
  >();
  private body?: IShadowTextBody;

  public loadDocument(
  ): void {
    this.addAgent("editor.writing", new TypingAgent(this, this.body!));
    this.addAgent("editor.formatting", new FormattingAgent());
    this.addAgent("addtoc", new AddTocAgent(this, this.body!));
  }

  public processMessage(action: ShadowMessage) {
    // TODO: need to sort states
    // what do we do with recursive dependencies?
    this.actions.push(action);
    for (let [_, state] of this.agents) {
      state.onAction(action);
    }
  }

  public invokeAction<T extends ShadowMessageArgs = ShadowMessageArgs>(
    msg: ShadowMessageId,
    args?: T
  ): void {
    this.processMessage(new ShadowMessage(msg, args));
  }

  public addAgent(stateName: AgentName, state: IShadowAgent) {
    this.agents.set(stateName, state);
  }

  public canDisplaySuggestion(id: ShadowMessageId): boolean {
    return true;
  }
  public displaySuggestion(id: ShadowMessageId): void {

  }

  getAgent(stateName: AgentName): IShadowAgent {
    return this.getAgent(stateName);
  }
}

