import { ChatCompletionTool } from "openai/resources/chat";

export interface MCPToolCall {
  name: string;
  arguments: any;
}

// Define MCP tools configuration for OpenAI function calling
export const mcpTools: ChatCompletionTool[] = [
  {
    type: 'function' as const,
    function: {
      name: 'get_skills',
      description: 'Get stored instructions by name. Returns instruction text and available steps if applicable.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Instruction name (e.g., "edit_text", "create_document", "selectskill", "create_blueprint", "use_blueprint", "edit_image", "edit_comment").'
          },
          step: {
            type: 'string',
            description: 'Optional step name when requesting a specific step from a multi-step instruction (e.g., "structure", "selection", "revise", "format", "blueprint", "outline", "compose", "finalize").'
          }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_contentrange',
      description: 'Read range of document content from HTML parts stored in the database. Omit start_para and end_para to read entire document from start to end',
      parameters: {
        type: 'object',
        properties: {
          docid: { type: 'string', description: 'Document ID' },
          format: { type: 'string', enum: ['text', 'html'] },
          start_para: { type: 'string', description: 'Starting paragraph ID (optional)' },
          end_para: { type: 'string', description: 'Ending paragraph ID (optional)' }
        },
        required: ['docid', 'format']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'store_asset',
      description: `Store document data with embeddings. 
For large content, use chunking parameters.
All chunks of the same document MUST share the same chunkId, and include chunkIndex and totalChunks.`,
      parameters: {
        type: 'object',
        properties: {
          kind: { type: "string", description: "kind of asset stored" },
          filename: { type: 'string', description: 'name of the document asset is coming from' },
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description: 'Terms associated with the data'
          },
          start_para: { type: 'string' },
          end_para: { type: 'string' },
          scope: { type: 'string', description: 'scope for storing data such as body or cell' },
          content: { type: 'string', description: 'data to store' },

          // Chunking parameters
          chunkId: { type: 'string', description: 'Unique ID to group related chunks (required if chunked)' },
          chunkIndex: { type: 'integer', minimum: 0, description: 'Index of this chunk (0-based)' },
          eos: { "type": "boolean", "description": "true for last chunk" },
          //totalChunks: { type: 'integer', minimum: 1, description: 'Total number of chunks in this asset' }
        },
        required: ['keywords', 'content', 'chunkId', 'chunkIndex', 'eos']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'load_asset',
      description: 'Load stored asset by context keywords (keyword + optional semantic match).',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: "string", description: "kind of asset stored" },
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description: 'Context words/phrases to match (no filenames).'
          }
        },
        required: ['keywords']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_ranges',
      description: 'Find ranges in document that match a search pattern. Searches within HTML parts stored in the database. Returns array of ranges with unique range_id that can be used for operations like set_formatting(range_id).',
      parameters: {
        type: 'object',
        properties: {
          docid: { type: 'string', description: 'Document ID to search within' },
          pattern: { type: 'string', description: 'Search pattern to match' },
          match_type: {
            type: 'string',
            enum: ['exact', 'regex', 'semantic'],
            description: 'Type of matching: "exact" for literal string match, "regex" for regular expression, "semantic" for embedding-based similarity match'
          },
          context_lines: {
            type: 'number',
            description: 'Number of context lines around matches (optional, default: 0)'
          }
        },
        required: ['docid', 'pattern', 'match_type']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_context',
      description: 'Get context information based on terms like last_file_name, last_range, current_document, etc.',
      parameters: {
        type: 'object',
        properties: {
          terms: {
            type: 'array',
            items: { type: 'string' },
            description: 'Terms to get context for (e.g., ["last_file_name"], ["last_range"], ["current_document"])'
          }
        },
        required: ['keywords']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_context',
      description: 'Set context value based on terms. The terms will be used to look up the context name, then store the value.',
      parameters: {
        type: 'object',
        properties: {
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description: 'Keywords to identify which context to set (e.g., ["document_name"], ["current_file"])'
          },
          value: {
            type: 'string',
            description: 'The value to store in the context'
          }
        },
        required: ['keywords', 'value']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_file',
      description: 'Find files in the content directory using glob patterns (* for any characters, ? for single character)',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'File pattern to search for (supports * and ? wildcards)' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'store_history',
      description: 'Store work history with current prompt and summary of work performed',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Summary of work performed in this session' }
        },
        required: ['summary']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'load_history',
      description: 'Load recent work history entries',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Number of history entries to retrieve (default: 10, max: 50)', minimum: 1, maximum: 50 }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'make_id',
      description: 'Generate a random 31-bit ID as a string',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'document_create',
      description: 'Create a new document in the database. Returns the document ID. Use this at the start of document creation workflow.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Document name/filename (e.g., "story.html", "report.docx")' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'store_htmlpart',
      description: 'Store an HTML part/fragment for a document. Supports chunking for parts larger than 1000 tokens. When eos=true, automatically adds IDs to HTML elements (p, table, tr, td, th, etc.) that lack them and returns the complete HTML with all IDs for selection purposes. Use this to break large HTML content into manageable sections, subsections, tables, or cells.',
      parameters: {
        type: 'object',
        properties: {
          partid: { type: 'string', description: 'Unique identifier for this HTML part (use make_id to generate)' },
          docid: { type: 'string', description: 'Document identifier this part belongs to' },
          html: { type: 'string', description: 'HTML content to store for this chunk' },
          chunkIndex: { type: 'integer', minimum: 0, description: 'Index of this chunk (0-based). Required for chunking.' },
          eos: { type: 'boolean', description: 'End of stream - true for the last chunk. When true, the response includes the complete HTML with auto-generated IDs.' }
        },
        required: ['partid', 'docid', 'html', 'chunkIndex', 'eos']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'load_htmlpart',
      description: 'Load a previously stored HTML part by document ID and part ID',
      parameters: {
        type: 'object',
        properties: {
          docid: { type: 'string', description: 'The document ID this part belongs to' },
          partid: { type: 'string', description: 'The part ID to retrieve' }
        },
        required: ['docid', 'partid']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'format_range',
      description: 'Apply character-level formatting to one or more ranges in a document. Ranges can be specified using range_id from find_ranges OR by providing exact text boundaries with paragraph IDs. For single-paragraph selections use {start_id, end_id, text}. For multi-paragraph selections use {start_id, start_text, end_id, end_text}. Properties are applied as an array of {prop, value} pairs supporting font, color, style, and Word-specific formatting options.',
      parameters: {
        type: 'object',
        properties: {
          docid: { type: 'string', description: 'Document ID containing the ranges to format' },
          ranges: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                range_id: { type: 'string', description: 'Unique range identifier from find_ranges result (optional if using text-based selection)' },
                start_id: { type: 'string', description: 'ID of starting paragraph (required for text-based selection)' },
                end_id: { type: 'string', description: 'ID of ending paragraph (required for text-based selection)' },
                text: { type: 'string', description: 'Exact text to format within a single paragraph (use with start_id=end_id)' },
                start_text: { type: 'string', description: 'Exact text at the start of a multi-paragraph selection (use with start_id)' },
                end_text: { type: 'string', description: 'Exact text at the end of a multi-paragraph selection (use with end_id)' },
                properties: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      prop: { type: 'string', description: 'Property name (e.g., "bold", "fontSize", "color", "backgroundColor", "italic", "underline")' },
                      value: { description: 'Property value (type varies: boolean for bold/italic, string for color/fontSize, etc.)' }
                    },
                    required: ['prop', 'value']
                  },
                  description: 'Array of formatting properties to apply'
                }
              },
              required: ['properties']
            },
            description: 'Array of ranges with their formatting properties'
          }
        },
        required: ['docid', 'ranges']
      }
    }
  }
];

// Create a map of tools by name for efficient lookup
export const mcpToolsMap = new Map<string, ChatCompletionTool>(
  mcpTools.map(tool => [tool.function.name, tool])
);
