import { FormattingAgent } from "./formattingagent.ts";
import { ShadowTextBodyMock } from "./shadowtextbodymock.ts";
import { TypingAgent } from "./typingagent.ts";
import { Shadow } from "./shadow.ts";
import {
  type GlobalCp,
  type ShadowRevisionId,
  type MoveIpArgs,
  type TypeArgs,
} from "./shadowmessage.ts";
import { AddTocAgent } from "./addtocagent.ts";
import { tlsh } from "./tlsh/tlsh.js"

export function runShadowTest() {
  let body = new ShadowTextBodyMock();

  // lane.registerOnMatch("nake N changes ", () => {
  //   lane.triggerState("editor.write")
  // });

  // lane.registerOnMatch("nake N changes ", () => {
  //   lane.triggerState("editor.formatting")
  // });

  let shadow = new Shadow();

  shadow.addAgent("typing", new TypingAgent(shadow, body));
  shadow.addAgent("formatting", new FormattingAgent());
  shadow.addAgent("addtoc", new AddTocAgent(shadow, body!));

  //shadow.addAgent("display.sectionsummary", new DisplaySectionSummaryState(shadow, body));

  //lane.addState("editor.editing", null);

  shadow.processMessage(
    {
      id: "user.type",
      args: {
        rev: "1" as ShadowRevisionId,
      }
    }
  );
  shadow.processMessage(
    {
      id: "user.type", args: {
        rev: "2" as ShadowRevisionId,
      }
    });

  shadow.processMessage(
    { id: "user.moveip", args: { cp: 0 as GlobalCp } });
}

// describe("Shadow", () => {
//   beforeEach(() => { });

//   it("simple", () => { });
// });
//runShadowTest();

let val = tlsh(`import {
  type ShadowMessageId,
  ShadowMessage,
} from "./shadowmessage.ts";
import type { IShadow, IShadowTextBody } from "./ishadow.ts";
import type { IShadowAgent, AgentName } from "./ishadowagent.ts";

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

  public loadDocument(body: IShadowTextBody): void {
    this.body = body;
  }

  public processMessage(action: ShadowMessage) {
    // TODO: need to sort states
    // what do we do with recursive dependencies?
    this.actions.push(action);
    for (let [_, state] of this.agents) {
      state.onAction(action);
    }
  }

  public invokeAction(msg: ShadowMessage): void {
    this.processMessage(msg);
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
}`);

console.log(val);