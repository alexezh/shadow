import {
  type ShadowMessageArgs,
  type ShadowMessageId,
  ShadowMessage,
} from "./shadowmessage";
import type { IShadow, IShadowTextBody } from "./ishadow";
import type { IShadowAgent, AgentName } from "./ishadowagent";
import { AFrameworkApplication } from "@1js/msoserviceplatform";
import { TypingAgent } from "./typingagent";
import type { ISwmDocument } from "../Swm/Swm";
import { ShadowTextBody } from "./shadowtextbody";
import { FormattingAgent } from "./formattingagent";
import { ULS, ULSCat, ULSTraceLevel } from "@1js/wac-browsertelemetry";
import { AddTocAgent } from "./addtocagent";
import type { IWireGraph_Swimmable } from "../WireGraph/IWireGraph_Swimmable";

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
  private readonly actions: ShadowMessage[] = [];
  private readonly agents: Map<AgentName, IShadowAgent> = new Map<
    AgentName,
    IShadowAgent
  >();
  private body?: IShadowTextBody;

  public loadDocument(
    doc: ISwmDocument,
    swimmable: IWireGraph_Swimmable
  ): void {
    this.body = new ShadowTextBody(swimmable, doc.body.id);
    this.addAgent("editor.writing", new TypingAgent(this, this.body));
    this.addAgent("editor.formatting", new FormattingAgent());
    this.addAgent("addtoc", new AddTocAgent(this, this.body));
  }

  public processMessage(action: ShadowMessage) {
    // TODO: need to sort states
    // what do we do with recursive dependencies?
    this.actions.push(action);
    for (let [_, state] of this.agents) {
      state.onAction(action);
    }
  }

  public invokeAction<T extends ShadowMessageArgs = ShadowMessageArgs>(
    msg: ShadowMessageId,
    args?: T
  ): void {
    ULS.sendTraceTag(
      0x1e251003 /* tag_4jrad */,
      ULSCat.msoulscat_Wac_WireGraph,
      ULSTraceLevel.info,
      `invokeAction: [msg: ${msg}]`
    );

    this.processMessage(new ShadowMessage(msg, args));
  }

  public addAgent(stateName: AgentName, state: IShadowAgent) {
    this.agents.set(stateName, state);
  }

  getAgent(stateName: AgentName): IShadowAgent {
    return this.getAgent(stateName);
  }

  @cached
  public static get useShadow(): boolean {
    return AFrameworkApplication?.appSettingsManager?.getBooleanFeatureGate(
      "Microsoft.Office.WordOnline.UseShadow",
      false
    );
  }
}

let shadow: IShadow | null = null;

export function getShadow(): IShadow | null {
  return shadow;
}

export function initShadow(): boolean {
  if (!Shadow.useShadow) {
    return false;
  } else {
    if (!shadow) {
      // we are going to initialize later once we have a document
      shadow = new Shadow();
    }
    return true;
  }
}
