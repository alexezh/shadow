import { Database } from './database.js';
import { importBlueprint } from './import-blueprint.js';
import { importDoc } from './import-doc.js';
import { INITIAL_RULES } from './init.js';
import { mcpTools } from './mcp-client.js';
import { generateEmbedding, OpenAIClient } from './openai-client.js';
import * as readline from 'readline';

export class ConsoleApp {
  private database: Database;
  private openaiClient: OpenAIClient;
  private rl: readline.Interface;

  constructor(database: Database) {
    this.database = database;
    this.openaiClient = new OpenAIClient(database);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async start(): Promise<void> {
    console.log('Console mode started. Available commands: !init, !list-rules, !get-rule, !store-rule, !import, exit');

    this.promptUser();
  }

  private promptUser(): void {
    this.rl.question('> ', async (input) => {
      const trimmed = input.trim();
      if (trimmed === 'exit') {
        await this.stop();
        return;
      }

      try {
        await this.handleCommand(trimmed);
      } catch (error) {
        console.error(`Error: ${error}`);
      }

      this.promptUser();
    });
  }

  private async handleCommand(command: string): Promise<void> {
    const parts = command.split(' ');
    const cmd = parts[0];

    switch (cmd) {
      case '!init':
        await this.handleInit();
        break;

      case '!list-instructions':
        await this.handleListRules();
        break;

      case '!get-instruction':
        if (parts.length < 2) {
          console.log('Usage: get-rule <term1> [term2] ...');
          return;
        }
        await this.handleGetInstructions(parts.slice(1));
        break;

      case '!store-instruction':
        await this.handleStoreInstruction();
        break;

      case '!import-doc':
        if (parts.length < 2) {
          console.log('Usage: !import <filename>');
          return;
        }
        await importDoc(parts[1], this.openaiClient);
        break;

      case '!import-blueprint':
        if (parts.length < 2) {
          console.log('Usage: !import <filename>');
          return;
        }
        await importBlueprint(parts[1], this.openaiClient);
        break;

      default:
        // Treat as chat message if not starting with !
        if (!command.startsWith('!')) {
          await this.handleChatMessage(command);
        } else {
          console.log('Unknown command. Available: !init, !list-rules, !get-rule, !store-rule, !import, exit');
        }
    }
  }

  private async handleInit(): Promise<void> {
    console.log('Initializing database with default rules...');

    // Clear existing instructions
    console.log('Clearing existing instructions...');
    await this.database.clearInstructions();

    let successCount = 0;
    let errorCount = 0;

    for (const rule of INITIAL_RULES) {
      try {
        const embedding = await this.openaiClient.generateEmbedding(rule.terms);
        await this.database.storeInstruction(rule.terms, rule.text, embedding);
        console.log(`✓ Stored rule for [${rule.terms.join(', ')}]`);
        successCount++;
      } catch (error) {
        console.error(`✗ Failed to store rule for [${rule.terms.join(', ')}]: ${error}`);
        errorCount++;
      }
    }

    console.log(`\nInitialization complete: ${successCount} rules stored, ${errorCount} errors`);
  }

  private async handleListRules(): Promise<void> {
    const allRules = await this.database.getAllInstructions();
    if (allRules.length === 0) {
      console.log('No rules found.');
      return;
    }

    console.log('Available rules:');
    allRules.forEach((rule, index) => {
      console.log(`${index + 1}. Terms: ${rule.terms} (${rule.text.substring(0, 50)}...)`);
    });
  }

  private async handleGetInstructions(terms: string[]): Promise<void> {
    const texts = await this.database.getAllTextsForTerms(terms);

    if (texts.length === 0) {
      console.log(`No rules found for terms: ${terms.join(', ')}`);
      return;
    }

    console.log(`Rules for terms [${terms.join(', ')}]:`);
    texts.forEach((text, index) => {
      console.log(`\n${index + 1}. ${text}`);
    });
  }

  private async handleStoreInstruction(): Promise<void> {
    return new Promise((resolve) => {
      this.rl.question('Enter terms (space-separated): ', (termsInput) => {
        const terms = termsInput.trim().split(/\s+/);

        this.rl.question('Enter rule text: ', async (text) => {
          try {
            const embedding = await this.openaiClient.generateEmbedding(terms);
            await this.database.storeAsset(terms, text.trim(), embedding);
            console.log(`Rule stored successfully for terms: ${terms.join(', ')}`);
          } catch (error) {
            console.error(`Failed to store rule: ${error}`);
          }
          resolve();
        });
      });
    });
  }

  private async handleChatMessage(message: string): Promise<void> {
    try {
      console.log('🤔 Processing your message...');

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

      const response = await this.openaiClient.chatWithMCPTools(mcpTools, systemPrompt, message);
      console.log('🤖 Shadow:', response);

    } catch (error) {
      console.error('❌ Error processing chat message:', error);
    }
  }

  async stop(): Promise<void> {
    this.rl.close();
    await this.database.close();
    console.log('Console app stopped.');
    process.exit(0);
  }
}