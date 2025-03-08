import type { ShadowMessageId, ShadowMessage, GlobalCp } from "./shadowmessage.ts";
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
// for type message, get revision (as id) and have method to get changes as ops

/**
 * represent logical range of change
 * the idea is to track where user is typing to detect
 * cases when a user 
 */
export class EditRegion {
  public startPosName: DurablePositionId | null = null;
  public endPosName: DurablePositionId | null = null;
  public editCount: number = 0;

  public static containsCp(start: number | null, end: number | null, cp: number): boolean {
    return true;
  }
}


/**
 * arbitrary set of paragraphs
 */
// export class SemSwmContainer {

// }


// export class SemSwmBody {

// }


/**
 * the goal for TypingAgent is to convert typing into higher level events
 * such differentiating between editing and correcting. To do this, we need
 * to differentiate between cases when a user enters text, and user starts jumping
 * around fixing and polishing things. Which boils down to the question of what
 * are the boundaries between elements
 * 
 * Luckily, we already discussing semantic model as a way to make such boundaries.
 * 
 * So with the help of semantic model, we can implement typing agent as following
 * 
 * - when a user enters new text, typing agent tracks start of typing and keeps
 *   extending the region. 
 * - if a user moves outside the region - the agent generates end event
 * - in parallel, semantic model processes new text at paragraph levels and can 
 *   produce new boundaries for text which was just entered
 * - if this happens, the agent reduces the region
 * 
 * when a user writes a new document, changes are usually contiguous.
 */
export class TypingAgent implements IShadowAgent {
  private readonly body: IShadowTextBody;
  private readonly shadow: IShadow;
  public weight: PValue = 0 as PValue;

  private typeDelta = 0.01;
  private formatDelta = -0.01;
  private moveDelta = -0.01;

  private curEditRegion: EditRegion | null = null;

  /**
   * last region which user has edited; technically it can be a stack
   * but we do not want to track too many regions
   */
  private lastEditRegion: EditRegion | null = null;

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

      let range = this.body.getEditRange(action.args!.rev);

      // remember position we stated typing
      if (!this.curEditRegion) {
        this.curEditRegion = this.makeRegion(range);

        this.startPosName = this.body.addDurablePosition(
          (action.args as TypeArgs).cp
        );

        this.shadow.invokeAction({
          id: "editor.startwriting", args: {
            cp: (action.args as TypeArgs).cp,
          }
        });
      } else {
        this.body.getDurablePosition(this.startPosName);
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

  private makeRegion(range: { start: GlobalCp, end: GlobalCp }): EditRegion {
    if (this.lastEditRegion) {
      let cpStart = this.body.getDurablePosition(this.lastEditRegion.startPosName);
      let cpEnd = this.body.getDurablePosition(this.lastEditRegion.endPosName);

      // TOOD: what do we do with overlaps
      if (EditRegion.containsCp(cpStart, cpEnd, range.start)) {

      }
    }

    return null;
  }

  private deleteRegion(region: EditRegion): void {
    this.body.removeDurablePosition(region.startPosName);
    this.body.removeDurablePosition(region.endPosName);
  }
}
