
export function getChatPrompt(message: string): string {
  const systemPrompt = ` 
When users ask you to perform an action, you should:
1. Use get_instructions with relevant terms to find instructions for the task
2. Follow those instructions step by step until completion
3. Use available MCP tools to accomplish the task

Available tools:
- get_instructions: Get stored instructions for terms (you choose the terms based on user request)
- store_asset: Store text with embeddings  
- load_asset: Load data by terms
- get_contentrange: Read document content ranges

User request: ${message}

Start by calling get_instructions with appropriate terms based on what the user is asking for. 
The initial set of instructions can be accessed with following terms
- import document: import document into the document library
- edit document: basic editing of an document
`;

  return systemPrompt
}