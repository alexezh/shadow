import { ShadowAction } from "./action";
import { DurablePositionId, IShadow, IShadowTextBody } from "./ishadow";
import { IShadowAgent, MoveIpArgs, PValue, StartWritingArgs, TimeValue, TypeArgs, updateWeight } from "./ishadowagent";

/**
 * display summary for section when a user typed enoigh data to make decision
 */
export class DisplaySectionSummaryState implements IShadowAgent {
  private readonly body: IShadowTextBody;
  private readonly shadow: IShadow;
  public weight: PValue;
  private lastDisplayed: TimeValue = -1 as TimeValue;
  private sessionDisable: PValue = 0 as PValue;
  private rejectDelta = -0.3;
  private acceptDelta = 0.3;
  private suggestionDistance = 300;
  private startPosName: DurablePositionId | null = null;

  public constructor(shadow: IShadow, body: IShadowTextBody) {
    this.body = body;
    this.shadow = shadow;

    // we want to track amount of new text a user has entered
  }

  public onAction(action: ShadowAction): PValue {
    let weight = this.weight;
    if (action.name === "sectionsummary.reject") {
      weight = updateWeight(weight, this.rejectDelta)
    } else if (action.name === "sectionsummary.accept") {
      weight = updateWeight(weight, this.acceptDelta)
    } else if (action.name === "editor.startwriting") {
      this.body.addDurablePosition((action.args as StartWritingArgs).cp);
    } else if (action.name === "editor.type") {
      if (this.startPosName) {
        let dist = this.body.getNormalizedDistance(this.body.getDurablePosition(this.startPosName), (action.args as TypeArgs).cp);
        if (dist > this.suggestionDistance) {
          this.shadow.invokeAction("sectionsummary.display");
        }
      }
    }

    this.weight = weight;
    return this.weight;
  }
}