import { Session } from "../server/session";

export async function replaceContentRange(session: Session,
  args: {
    docid: string;
    format: string;
    start_para?: string;
    end_para?: string;
    content: string;
  }): Promise<string> {
  console.log(`replaceContentRange [start: ${args.start_para}] [end: ${args.end_para}]`);
  // TODO: Implement content range replacement
  return "replaceContentRange not yet implemented";
}