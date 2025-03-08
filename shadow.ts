import { type ActionName, ShadowAction } from "./action.ts";
import { CorrectingAgent } from "./correctingagent";
import { DisplaySectionSummaryState } from "./displaysectionsummary";
import { FormattingAgent } from "./formattingagent";
import type { IShadow } from "./ishadow";
import { ActionArgs, TypeArgs, IShadowAgent, AgentName, TimeValue, MoveIpArgs, ShadowCp } from "./ishadowagent";
import { ShadowTextBody } from "./shadowtextbody";
import { WritingAgent } from "./writingagent";

// rate of accept
// rate pf accept categpru
// relative position and direction of scroll
// time since display to accept/reject
// ==== which will accept next =====
// move_relative ... move to top ..., move to bottom, move next section
// reuse_copy - edits similar to previous edits... need to remember previous edits ...
// will be annoying to wait for suggestion, but then we can do it
// test suggestion - see if user will do it. but does not intro to users who do not know
// 

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
class Shadow implements IShadow {
  private readonly actions: ShadowAction[] = [];
  private readonly agents: Map<AgentName, IShadowAgent> = new Map<AgentName, IShadowAgent>();

  public processAction(action: ShadowAction) {
    // TODO: need to sort states
    // what do we do with recursive dependencies?
    this.actions.push(action);
    for (let [key, state] of this.agents) {
      state.onAction(action);
    }
  }

  public invokeAction<T extends ActionArgs = ActionArgs>(action: ActionName, args?: T): void {
    this.processAction(new ShadowAction(action, args));
  }

  canDisplaySuggestion(action: ActionName): boolean {
    return false;
  }

  public displaySuggestion<T extends ActionArgs = ActionArgs>(action: ActionName, args?: T): void {

  }

  public addAgent(stateName: AgentName, agent: IShadowAgent) {
    this.agents.set(stateName, agent);
    if (agent.suggestion) {

    }
  }

  getAgent(stateName: AgentName): IShadowAgent {
    return this.getAgent(stateName);
  }
}


//export type ActionCategory = "none" | "editor" | "ai";

let shadow = new Shadow();
let body = new ShadowTextBody();

// lane.registerOnMatch("nake N changes ", () => {
//   lane.triggerState("editor.write")
// });

// lane.registerOnMatch("nake N changes ", () => {
//   lane.triggerState("editor.formatting")
// });

shadow.addAgent("editor.writing", new WritingAgent(shadow, body));
shadow.addAgent("editor.formatting", new FormattingAgent());
shadow.addAgent("editor.correcting", new CorrectingAgent(shadow));
shadow.addAgent("display.sectionsummary", new DisplaySectionSummaryState(shadow, body));

//lane.addState("editor.editing", null);

shadow.processAction(new ShadowAction<TypeArgs>("editor.type", { cp: 0 as ShadowCp, inserted: 3, deleted: 0 }));
shadow.processAction(new ShadowAction<TypeArgs>("editor.type", { cp: 0 as ShadowCp, inserted: 2, deleted: 0 }));
shadow.processAction(new ShadowAction<MoveIpArgs>("editor.moveip", { cp: 0 as ShadowCp }));