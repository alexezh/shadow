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
class Shadow {
  private lanes: ShadowAction[];
  private states: Map<StateName, IShadowState> = new Map<StateName, IShadowState>();

  public add(action: ShadowAction) {

  }

  public addState(stateName: StateName, state: IShadowState) {
    this.states.set(stateName, state);
  }

  public registerOnMatch(pattern: any, func: () => void) {

  }
}

export type ActionName = "none" |
  // logged when a user typed non-trivial amount of text
  // the exact logic for some events will be defined by lower level models
  "editor.type" |
  "editor.moveip" |
  "editor.format" |
  "editor.correct" |
  "editor.inserttable" |
  "editor.insertpicture" |
  "ai.summary" |
  // agent suggesting toc
  "ai.toc" |
  "ai.suggest.struggle" |
  // agent which detects that user is struggling and might need help to rewrite
  "ai.accept.struggle" |
  "ai.reject.struggle" |
  // agent which detects that a user accepts grammar suggestions of certain tyoe
  // and suggests to fix them all
  "ai.fixall" |
  // grammar 
  "ai.grammar" |
  "ai.rewrite";

//export type ActionCategory = "none" | "editor" | "ai";

class ShadowAction<T extends ActionArgs = ActionArgs> {
  public readonly name: ActionName = "none";
  public readonly args?: T;
  public readonly invokedTime?: TimeValue;

  constructor(name: ActionName, args?: T) {
    this.name = name;
    this.args = args;
  }

  // original states
}

export type StateName =
  "editor.formatting" |
  "editor.writing" | // mostly new text
  "editor.editing" | // changing existing text
  "editor.correcting" |
  "editor.struggle" |
  "display.struggle" |
  "display.rewrite" |
  "display.sectionsummary"

/**
 * number is more compact representation of time
 */
export type TimeValue = number & {
  __tagtime: never;
}

export type PValue = number & {
  __tagprob: never;
}

/**
 * 0-1 same paragraphs, 1000 and -1000 end of document
 */
export type TextDistance = number & {
  __tagdist: never;
}

export type ActionArgs = {
  __tagargs: never;
}

export type EditArgs = ActionArgs & {
}

export type MoveArgs = ActionArgs & {
  distance?: TextDistance,
}

// class MemoryLane {
//   public actions: Action[];
// }

interface IShadowState {
  onAction(action: ShadowAction): PValue;
  readonly weight: PValue;
}


class ShadowWritingState implements IShadowState {
  public weight: PValue = 0 as PValue;
  private typeDelta = 0.01;
  private formatDelta = -0.01;
  private moveDelta = -0.01;

  public onAction(action: ShadowAction): PValue {
    if (action.name === "editor.edit")

      return this.weight;
  }
}

let lane = new Shadow();

// lane.registerOnMatch("nake N changes ", () => {
//   lane.triggerState("editor.write")
// });

// lane.registerOnMatch("nake N changes ", () => {
//   lane.triggerState("editor.formatting")
// });

lane.addState("editor.writing", new ShadowWritingState());

lane.addState("editor.editing", (state: ShadowState, action: ShadowAction): PValue => {
  return 0 as PValue
});

lane.registerOnMatch(null, () => {

});

lane.add(new ShadowAction<EditArgs>("editor.edit"));
lane.add(new ShadowAction<EditArgs>("editor.edit"));
lane.add(new ShadowAction<EditArgs>("editor.moveip"));