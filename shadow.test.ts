import { FormattingAgent } from "./formattingagent.ts";
import { ShadowTextBodyMock } from "./shadowtextbodymock.ts";
import { TypingAgent } from "./typingagent.ts";
import { Shadow } from "./shadow.ts";
import {
  GlobalCp,
  ShadowRevisionId,
  type MoveIpArgs,
  type TypeArgs,
} from "./shadowmessage.ts";
import { AddTocAgent } from "./addtocagent.ts";

export function runShadowTest() {
  let body = new ShadowTextBodyMock();

  // lane.registerOnMatch("nake N changes ", () => {
  //   lane.triggerState("editor.write")
  // });

  // lane.registerOnMatch("nake N changes ", () => {
  //   lane.triggerState("editor.formatting")
  // });

  let shadow = new Shadow();

  shadow.addAgent("typing", new TypingAgent(shadow, body));
  shadow.addAgent("formatting", new FormattingAgent());
  shadow.addAgent("addtoc", new AddTocAgent(shadow, body!));

  //shadow.addAgent("display.sectionsummary", new DisplaySectionSummaryState(shadow, body));

  //lane.addState("editor.editing", null);

  shadow.processMessage(
    {
      id: "user.type",
      args: {
        rev: "1" as ShadowRevisionId,
      }
    }
  );
  shadow.processMessage(
    {
      id: "user.type", args: {
        rev: "2" as ShadowRevisionId,
      }
    });

  shadow.processMessage(
    { id: "user.moveip", args: { cp: 0 as GlobalCp } });
}

// describe("Shadow", () => {
//   beforeEach(() => { });

//   it("simple", () => { });
// });
runShadowTest();