import { ActionName, ShadowAction } from "./action";
import { CorrectingState } from "./correctingstate";
import { FormattingState } from "./formattingstate";
import type { IShadow } from "./IShadow";
import { ActionArgs, EditArgs, IShadowState, StateName, TimeValue } from "./ishadowstate";
import { WritingState } from "./writingstate";

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
  private readonly states: Map<StateName, IShadowState> = new Map<StateName, IShadowState>();

  public processAction(action: ShadowAction) {
    // TODO: need to sort states
    // what do we do with recursive dependencies?
    this.actions.push(action);
    for (let [key, state] of this.states) {
      state.onAction(action);
    }
  }

  public addState(stateName: StateName, state: IShadowState) {
    this.states.set(stateName, state);
  }

  public registerOnMatch(pattern: any, func: () => void) {

  }
}


//export type ActionCategory = "none" | "editor" | "ai";

let lane = new Shadow();

// lane.registerOnMatch("nake N changes ", () => {
//   lane.triggerState("editor.write")
// });

// lane.registerOnMatch("nake N changes ", () => {
//   lane.triggerState("editor.formatting")
// });

lane.addState("editor.writing", new WritingState());
lane.addState("editor.formatting", new FormattingState());
lane.addState("editor.correcting", new CorrectingState());

//lane.addState("editor.editing", null);

lane.registerOnMatch(null, () => {

});

lane.processAction(new ShadowAction<EditArgs>("editor.type"));
lane.processAction(new ShadowAction<EditArgs>("editor.type"));
lane.processAction(new ShadowAction<EditArgs>("editor.moveip"));