import { ShadowAction } from "./action";
import { IShadow, IShadowTextBody } from "./ishadow";
import { IShadowAgent, PValue, TimeValue, updateWeight } from "./ishadowagent";

/**
 * display summary for section when a user typed enoigh data to make decision
 */
export class DisplaySectionSummaryState implements IShadowAgent {
  private readonly body: IShadowTextBody;
  private readonly shadow: IShadow;
  public weight: PValue;
  private writing: IShadowAgent;
  private lastDisplayed: TimeValue = -1 as TimeValue;
  private sessionDisable: PValue = 0 as PValue;
  private rejectDelta = -0.3;
  private acceptDelta = 0.3;

  public constructor(shadow: IShadow, body: IShadowTextBody) {
    this.body = body;
    this.shadow = shadow;
    this.writing = shadow.getState("editor.writing");

    // we want to track amount of new text a user has entered
  }

  public onAction(action: ShadowAction): PValue {
    let weight = this.weight;
    if (action.name === "sectionsummary.reject") {
      weight = updateWeight(weight, this.rejectDelta)
    } else if (action.name === "sectionsummary.accept") {
      weight = updateWeight(weight, this.acceptDelta)
    } else if (action.name === "editor.type") {
      let dist = this.body.getNormalizedDistance(this.body.getDurablePosition(this.startPosName), (action.args as MoveIpArgs).cp);
      if (dist > this.suggestionDistance) {
        this.shadow.invokeAction("sectionsummary.display");
      }

    }

    this.weight = weight;
    return this.weight;
  }
}