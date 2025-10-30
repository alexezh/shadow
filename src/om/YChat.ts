import { make31BitId } from "./make31bitid.js";
import { YBody } from "./YBody.js";

export class YChat {
  public id: string;
  public messages: YChatMessage[] = [];

  public constructor(id?: string) {
    this.id = id || make31BitId();
  }
}

export class YChatMessage {
  public body: YBody;
  public id: string;
  public role: 'user' | 'assistant' | 'system';

  public constructor(body: YBody, role: 'user' | 'assistant' | 'system' = 'user') {
    this.body = body;
    this.id = make31BitId();
    this.role = role;
  }
}