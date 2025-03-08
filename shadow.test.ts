import { FormattingAgent } from "./formattingagent.ts";
import { ShadowTextBody } from "./shadowtextbody.ts";
import { TypingAgent } from "./typingagent.ts";
import { Shadow } from "./shadow.ts";
import {
  GlobalCp,
  type MoveIpArgs,
  type TypeArgs,
} from "./shadowmessage.ts";

export function runShadowTest() {
  let body = new ShadowTextBody();

  // lane.registerOnMatch("nake N changes ", () => {
  //   lane.triggerState("editor.write")
  // });

  // lane.registerOnMatch("nake N changes ", () => {
  //   lane.triggerState("editor.formatting")
  // });

  let shadow = new Shadow();

  shadow.addAgent("typing", new TypingAgent(shadow, body));
  shadow.addAgent("formatting", new FormattingAgent());
  //shadow.addAgent("display.sectionsummary", new DisplaySectionSummaryState(shadow, body));

  //lane.addState("editor.editing", null);

  shadow.processMessage(
    {
      id: "user.type",
      args: {
        cp: 0 as GlobalCp,
        inserted: 3,
        deleted: 0,
      }
    }
  );
  shadow.processMessage(
    {
      id: "user.type", args: {
        cp: 0 as GlobalCp,
        inserted: 2,
        deleted: 0,
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