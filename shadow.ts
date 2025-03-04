import { ActionName, ShadowAction } from "./action";
import { CorrectingAgent } from "./correctingagent";
import { DisplaySectionSummaryState } from "./displaysectionsummary";
import { FormattingAgent } from "./formattingagent";
import type { IShadow } from "./ishadow";
import { ActionArgs, TypeArgs, IShadowAgent, AgentName, TimeValue, MoveIpArgs, ShadowCp } from "./ishadowagent";
import { ShadowTextBody } from "./shadowtextbody";
import { WritingAgent } from "./writingagent";

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

  public addState(stateName: AgentName, state: IShadowAgent) {
    this.agents.set(stateName, state);
  }

  getState(stateName: AgentName): IShadowAgent {
    return this.getState(stateName);
  }

  public registerOnMatch(pattern: any, func: () => void) {

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

shadow.addState("editor.writing", new WritingAgent(shadow, body));
shadow.addState("editor.formatting", new FormattingAgent());
shadow.addState("editor.correcting", new CorrectingAgent(shadow));
shadow.addState("display.sectionsummary", new DisplaySectionSummaryState(shadow, body));

//lane.addState("editor.editing", null);

shadow.registerOnMatch(null, () => {

});

shadow.processAction(new ShadowAction<TypeArgs>("editor.type", { cp: 0 as ShadowCp, inserted: 3, deleted: 0 });
shadow.processAction(new ShadowAction<TypeArgs>("editor.type", { cp: 0 as ShadowCp, inserted: 2, deleted: 0 });
shadow.processAction(new ShadowAction<MoveIpArgs>("editor.moveip", { cp: 0 as ShadowCp }));