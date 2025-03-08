import { ShadowMessage } from "./shadowmessage.ts";
import { FormattingAgent } from "./formattingagent.ts";
import type { TypeArgs, MoveIpArgs, GlobalCp } from "./ishadowagent.ts";
import { ShadowTextBody } from "./shadowtextbody.ts";
import { TypingAgent } from "./typingagent.ts";
import { Shadow } from "./shadow.ts";

export function runShadowTest() {
  let body = new ShadowTextBody();

  // lane.registerOnMatch("nake N changes ", () => {
  //   lane.triggerState("editor.write")
  // });

  // lane.registerOnMatch("nake N changes ", () => {
  //   lane.triggerState("editor.formatting")
  // });

  let shadow = new Shadow();

  shadow.addAgent("editor.writing", new TypingAgent(shadow, body));
  shadow.addAgent("editor.formatting", new FormattingAgent());
  //shadow.addAgent("display.sectionsummary", new DisplaySectionSummaryState(shadow, body));

  //lane.addState("editor.editing", null);

  shadow.processMessage(
    new ShadowMessage<TypeArgs>("user.type", {
      cp: 0 as GlobalCp,
      inserted: 3,
      deleted: 0,
    })
  );
  shadow.processMessage(
    new ShadowMessage<TypeArgs>("user.type", {
      cp: 0 as GlobalCp,
      inserted: 2,
      deleted: 0,
    })
  );
  shadow.processMessage(
    new ShadowMessage<MoveIpArgs>("user.moveip", { cp: 0 as GlobalCp })
  );
}

// describe("Shadow", () => {
//   beforeEach(() => { });

//   it("simple", () => { });
// });
