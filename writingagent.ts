import { ShadowAction } from "./action";
import { IShadow, IShadowTextBody } from "./ishadow";
import { IShadowAgent, MoveIpArgs, PValue, TypeArgs, updateWeight } from "./ishadowagent";

/**
 * track when a user types mostly new text in a continuous region
 */
export class WritingAgent implements IShadowAgent {
  public weight: PValue = 0 as PValue;
  private triggerLevel = 0.8;

  private typeDelta = 0.01;
  private formatDelta = -0.01;
  private moveDelta = -0.01;
  private readonly body: IShadowTextBody;
  private readonly shadow: IShadow;
  private startPosName = "writingstate";
  private startPos: boolean = false;

  /**
   * max move to reset start
   */
  private contiguousDistance = 0.3;

  /**
   * distance at which to display suggestion
   */
  private suggestionDistance = 0.3;

  public constructor(shadow: IShadow, body: IShadowTextBody) {
    this.body = body;
    this.shadow = shadow;
  }

  public onAction(action: ShadowAction): PValue {
    let weight = this.weight;
    if (action.name === "editor.type") {
      weight = updateWeight(weight, this.typeDelta);
      // remember position we stated typing
      if (!this.startPos) {
        this.body.addDurablePosition(this.startPosName, (action.args as TypeArgs).cp)
        this.startPos = true;
      } else {
        let dist = this.body.getNormalizedDistance(this.body.getDurablePosition(this.startPosName), (action.args as MoveIpArgs).cp);
        if (dist > this.suggestionDistance) {
          this.shadow.invokeAction("sectionsummary.display");
        }
      }
    } else if (action.name === "editor.format") {
      weight = updateWeight(weight, this.formatDelta);
    } else if (action.name === "editor.moveip") {
      weight = updateWeight(weight, this.moveDelta);

      if (this.startPos) {
        let dist = this.body.getNormalizedDistance(this.body.getDurablePosition(this.startPosName), (action.args as MoveIpArgs).cp);
        if (dist > this.contiguousDistance) {
          this.startPos = false;
        }
      }
    }

    if (weight > this.triggerLevel) {
      //this.
    }

    this.weight = weight;
    return this.weight;
  }
}
