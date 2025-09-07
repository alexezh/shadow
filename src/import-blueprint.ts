import { mcpTools } from "./mcp-client.js";
import { OpenAIClient } from "./openai-client.js";

/*
  get document text
  extract default formatting
  default paragraph - 80%
  default table
  get format??? keep of remake??
  i know if a user changed after rewrite; so we can change the rule
  need json file for simplicity

  how to handle small variations of layout. === treat the same 
  6 columns vs 7 columns - question is what 
*/

export async function importBlueprint(filename: string, openaiClient: OpenAIClient): Promise<void> {
  try {
    console.log(`🔄 Importing document: ${filename}`);

    const systemPrompt = `You are Shadow, a word processing software agent responsible for working with documents.

-read document text using get_contentrange method. Use 'html' as format. Assume that user specified file name in a prompt.
-complute semantical structure of the document
   * Example. If document is a resume which contains person name, address and other info, output
     such as document type - resume, person: tonnie, address: xyz, content and other semantical blocks 
   * store semantical structure as markdown using store_asset api with "semantic" tag
-make html where content replaces with {{semantic}} while keeping structure and formatting
   * Example, if html contains <p>Fred</p><p>1st ave</p> where 1st ave is an address, output <p>{{person:name}}</p><p>{{person.address}}</p>
   * if there are multiple entities such as person, use 1,2,3 to disambiguate
   * keep current CSS styles, do not add new one
   * store result html using store_asset api with "blueprint" tag

The user wants to import: ${filename}`;

    const userMessage = `Import document blueprint "${filename}" into the document library`;

    const response = await openaiClient.chatWithMCPTools(mcpTools, systemPrompt, userMessage);
    console.log('🤖 Shadow:', response);

  } catch (error) {
    console.error('❌ Error importing document:', error);
  }
}
