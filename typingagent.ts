import type { ShadowMessageId, ShadowMessage } from "./shadowmessage.ts";
import type { DurablePositionId, IShadow, IShadowTextBody } from "./ishadow.ts";
import {
  type MoveIpArgs,
  type PValue,
  type TypeArgs,
} from "./shadowmessage.ts";
import {
  type IShadowAgent,
  updateWeight,
} from "./ishadowagent.ts";

// how do I detect that change is single range?
// if I can capture every object, I can look at sequenc

/**
 * track when a user types mostly new text in a continuous region
 */
export class TypingAgent implements IShadowAgent {
  private readonly body: IShadowTextBody;
  private readonly shadow: IShadow;
  public weight: PValue = 0 as PValue;

  private typeDelta = 0.01;
  private formatDelta = -0.01;
  private moveDelta = -0.01;
  private startPosName: DurablePositionId | null = null;

  /**
   * max move to reset start
   */
  private contiguousDistance = 0.3;

  public get emits(): ShadowMessageId[] {
    return ["editor.startwriting", "editor.endwriting"];
  }

  public constructor(shadow: IShadow, body: IShadowTextBody) {
    this.body = body;
    this.shadow = shadow;
  }

  public onAction(action: ShadowMessage): PValue {
    let weight = this.weight;
    if (action.id === "user.type") {
      weight = updateWeight(weight, this.typeDelta);
      // remember position we stated typing
      if (!this.startPosName) {
        this.startPosName = this.body.addDurablePosition(
          (action.args as TypeArgs).cp
        );
        this.shadow.invokeAction({
          id: "editor.startwriting", args: {
            cp: (action.args as TypeArgs).cp,
          }
        });
      }
    } else if (action.id === "user.format") {
      weight = updateWeight(weight, this.formatDelta);
    } else if (action.id === "user.moveip") {
      weight = updateWeight(weight, this.moveDelta);

      if (this.startPosName) {
        let dist = this.body.getNormalizedDistance(
          this.body.getDurablePosition(this.startPosName),
          (action.args as MoveIpArgs).cp
        );
        if (dist > this.contiguousDistance) {
          this.startPosName = null;
          this.shadow.invokeAction({ id: "editor.endwriting" });
        }
      }
    }

    this.weight = weight;
    return this.weight;
  }
}
