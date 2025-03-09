import type { ShadowMessageId, ShadowMessage, GlobalCp, TimeValue, DurablePositionId } from "./shadowmessage.ts";
import type { IShadow, IShadowTextBody } from "./ishadow.ts";
import {
  type MoveIpArgs,
  type PValue,
  type TypeArgs,
} from "./shadowmessage.ts";
import {
  type IShadowAgent,
  type TunableNumber,
  updateWeight,
} from "./ishadowagent.ts";


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
 * one challenge with semantic model is elements might be too small or too big
 * such as a paragraph can be pages long and we would want to split editing in it.
 * 
 * also global cp is not sufficient. When we have tables, information on previous line
 * can be close on screen, but it is far away in text
 */
export class TypingAgent implements IShadowAgent {
  private readonly body: IShadowTextBody;
  private readonly shadow: IShadow;
  public weight: PValue = 0 as PValue;

  private typeDelta: TunableNumber = 0.01 as TunableNumber;
  private formatDelta: TunableNumber = -0.01 as TunableNumber;
  private moveDelta: TunableNumber = -0.01 as TunableNumber;

  /**
   * 5 seconds max time bettew regions
   */
  private maxAwayTime: TunableNumber = 5 as TunableNumber;

  /**
   * 3 edits for away region
   */
  private maxAwayEdits: TunableNumber = 3 as TunableNumber;

  /**
   * min number of edits to enter writing state
   */
  private minWriteEdits: TunableNumber = 3 as TunableNumber;

  /**
   * max number of chars to extend existing region
   */
  private maxExtendDistance: TunableNumber = 30 as TunableNumber;

  /**
   * max number of chars to a region can extend to
   * we assume that human context window is limited, and we only
   * switch context if we move too far. Potentially, we can use sentence boundary
   * for this rather than char number
   */
  private maxRegionSize: TunableNumber = 30 as TunableNumber;

  private curEditRegion: DurableEditRegion | null = null;

  /**
   * last region which user has edited; technically it can be a stack
   * but we do not want to track too many regions
   */
  private lastEditRegion: DurableEditRegion | null = null;

  /**
   * max move to reset start
   */
  private contiguousDistance = 0.3;

  public get emits(): ShadowMessageId[] {
    return ["typing.startwriting", "typing.endwriting"];
  }

  public constructor(shadow: IShadow, body: IShadowTextBody) {
    this.body = body;
    this.shadow = shadow;
  }

  public onAction(action: ShadowMessage): PValue {
    let weight = this.weight;
    if (action.id === "user.type" || action.id === "user.moveip") {
      weight = updateWeight(weight, this.typeDelta);

      let range = (action.id === "user.moveip") ?
        { start: action.args!.cp, end: action.args!.cp + 1 as GlobalCp }
        : this.body.getEditRange(action.args!.rev);

      let res = this.updateEditRegion(range);

      // remember position we stated typing
      if (res === "extend") {
        if (action.id === "user.type") {
          this.curEditRegion!.editCount++;
        }

        if (this.curEditRegion!.editCount > this.minWriteEdits) {
          this.curEditRegion!.isWriting = true;
          let start = this.body.addDurablePosition(range.start);
          this.shadow.invokeAction({
            id: "typing.startwriting", args: {
              pos: start
            }
          });
        }
      }
    } else if (action.id === "user.format") {
      weight = updateWeight(weight, this.formatDelta);
    }

    this.weight = weight;
    return this.weight;
  }

  /**
   * updates current region and return action taken
   *    extend - updates existing region
   *    create - create new region, closes existing
   *    return - returns to previous region
   */
  private updateEditRegion(range: { start: GlobalCp, end: GlobalCp }): "extend" | "return" | "create" {
    let now: number = new Date().valueOf();
    if (this.curEditRegion) {
      let reg = this.curEditRegion.resolve(this.body);
      if (reg) {
        reg.extend(this.maxExtendDistance);
        if (reg.containsCp(range.start) && reg.containsCp(range.end)) {
          this.curEditRegion.lastEditTime = now as TimeValue;
          return "extend";
        }
      }
    }

    if (this.lastEditRegion) {
      // if we are returning to previous region, assume that a user lost context
      // if it was more than X seconds
      let reg = this.lastEditRegion.resolve(this.body);
      if (reg) {
        reg.extend(this.maxExtendDistance);
        if (reg.containsCp(range.start) && reg.containsCp(range.end)) {
          if (this.lastEditRegion.lastEditTime + this.maxAwayTime > now &&
            this.curEditRegion!.editCount < this.maxAwayEdits
          ) {
            // reuse the region
            let temp = this.curEditRegion;

            this.shadow.invokeAction({
              id: "typing.endwriting", args: {
                editCount: this.curEditRegion!.editCount,
                duration: now - this.curEditRegion!.firstEditTime as TimeValue
              }
            });

            this.curEditRegion = this.lastEditRegion;
            this.lastEditRegion = temp;
            return "return";
          }
        }
      } else {
        // if we return too late, treat region as new
        this.deleteEditRegion(this.curEditRegion!);
      }
    }

    if (this.lastEditRegion) {
      this.shadow.invokeAction({
        id: "typing.endwriting", args: {
          editCount: this.lastEditRegion!.editCount,
          duration: now - this.lastEditRegion!.firstEditTime as TimeValue
        }
      });

      this.deleteEditRegion(this.lastEditRegion);
    }
    this.lastEditRegion = this.curEditRegion;
    let reg = new DurableEditRegion();

    reg.firstEditTime = reg.lastEditTime = now as TimeValue;
    reg.startPosName = this.body.addDurablePosition(range.start);
    reg.endPosName = this.body.addDurablePosition(range.start);
    reg.editCount = 1;

    this.curEditRegion = reg;
    return "create";
  }

  private deleteEditRegion(region: DurableEditRegion): void {
    this.body.removeDurablePosition(region.startPosName);
    this.body.removeDurablePosition(region.endPosName);
  }
}

// how do I detect that change is single range?
// if I can capture every object, I can look at sequenc
// for type message, get revision (as id) and have method to get changes as ops

/**
 * represent logical range of change
 * the idea is to track where user is typing to detect
 * cases when a user 
 */
export class DurableEditRegion {
  public startPosName: DurablePositionId | null = null;
  public endPosName: DurablePositionId | null = null;
  public editCount: number = 0;
  public firstEditTime: TimeValue = 0 as TimeValue;
  public lastEditTime: TimeValue = 0 as TimeValue;
  public isWriting: boolean = false;

  public resolve(body: IShadowTextBody): EditRegion | null {
    let cpStart = body.getDurablePosition(this.startPosName);
    let cpEnd = body.getDurablePosition(this.endPosName);
    if (!cpStart || !cpEnd) {
      return null;
    }

    let reg = new EditRegion(this);
    reg.startPos = cpStart;
    reg.endPos = cpEnd;
    return reg;
  }
}

export class EditRegion {
  public startPos: GlobalCp = 0 as GlobalCp;
  public endPos: GlobalCp = 0 as GlobalCp;
  public durable: DurableEditRegion;

  public constructor(durable: DurableEditRegion) {
    this.durable = durable;
  }

  public extend(cp: number): void {
    this.startPos = (this.startPos - cp) as GlobalCp;
    this.endPos = (this.endPos + cp) as GlobalCp;
  }

  public containsCp(cp: GlobalCp): boolean {
    return (cp >= this.startPos && cp <= this.endPos)
  }
}
