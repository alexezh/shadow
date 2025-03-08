import { ShadowMessageId, ShadowMessage } from "./shadowmessage";
import { DurablePositionId, IShadow, IShadowTextBody } from "./ishadow";
import { IShadowAgent, MoveIpArgs, PValue, StartWritingArgs, TimeValue, TypeArgs, updateWeight } from "./ishadowagent";

/**
 * display summary for section when a user typed enoigh data to make decision
 */
export class DisplaySectionSummaryState implements IShadowAgent {
  private readonly body: IShadowTextBody;
  private readonly shadow: IShadow;
  public weight: PValue = 0 as PValue;
  private lastDisplayed: TimeValue = -1 as TimeValue;
  private sessionDisable: PValue = 0 as PValue;
  private rejectDelta = -0.3;
  private acceptDelta = 0.3;
  private suggestionDistance = 300;
  private startPosName: DurablePositionId | null = null;

  public get suggestion(): ShadowMessageId[] {
    return ["sectionsummary.display"];
  }

  public constructor(shadow: IShadow, body: IShadowTextBody) {
    this.body = body;
    this.shadow = shadow;

    // we want to track amount of new text a user has entered
  }

  public onAction(action: ShadowMessage): PValue {
    let weight = this.weight;
    if (action.id === "sectionsummary.reject") {
      weight = updateWeight(weight, this.rejectDelta)
    } else if (action.id === "sectionsummary.accept") {
      weight = updateWeight(weight, this.acceptDelta)
    } else if (action.id === "editor.startwriting") {
      this.body.addDurablePosition((action.args as StartWritingArgs).cp);
    } else if (action.id === "user.type") {
      if (this.startPosName && this.shadow.canDisplaySuggestion("sectionsummary.display")) {
        let dist = this.body.getNormalizedDistance(this.body.getDurablePosition(this.startPosName), (action.args as TypeArgs).cp);
        if (dist > this.suggestionDistance) {
          this.shadow.displaySuggestion("sectionsummary.display");
        }
      }
    }

    this.weight = weight;
    return this.weight;
  }
}