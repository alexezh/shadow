import { mcpTools } from "./mcp-client";
import { OpenAIClient } from "./openai-client";

export async function handleImport(filename: string, openaiClient: OpenAIClient): Promise<void> {
  try {
    console.log(`🔄 Importing document: ${filename}`);

    const systemPrompt = `You are Shadow, a word processing software agent responsible for working with documents.

-read document text using get_contentrange method. Use 'text' as format. Assume that user specified file name in a prompt.
-split document into sections and subsections if any. 
-Use markdown headers as well as semantic of the document; add sections when needed even if there is no section in markdown. 
-For each section generate short summary and 3-7 keywords and invoke store_asset passing:
  title: summary of section
  level: level of section 1,2
  start_para: id pf first paragraph
  end_para: id of the last paragraph
  summary: summary of section

  paragraph ids specified as {id=xyz} at the end of paragraph

The user wants to import: ${filename}`;

    const userMessage = `Import the document "${filename}" into the document library`;

    const response = await openaiClient.chatWithMCPTools(mcpTools, systemPrompt, userMessage);
    console.log('🤖 Shadow:', response);

  } catch (error) {
    console.error('❌ Error importing document:', error);
  }
}
