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
      name: 'get_instructions',
      description: 'Get stored instructions for given terms',
      parameters: {
        type: 'object',
        properties: {
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of terms to get instructions for'
          }
        },
        required: ['keywords']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_contentrange',
      description: 'Read range of document content. Omit start_para and end_para to read entire document from start to end',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Document name' },
          format: { type: 'string', enum: ['text', 'html'] },
          start_para: { type: 'string', description: 'Starting paragraph ID (optional)' },
          end_para: { type: 'string', description: 'Ending paragraph ID (optional)' }
        },
        required: ['name', 'format']
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
      description: 'Find ranges in document that match one or more search keywords',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Document name' },
          format: { type: 'string', enum: ['text', 'html'] },
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description: 'Terms to search for'
          },
          context_lines: {
            type: 'number',
            description: 'Number of context lines around matches (optional, default: 0)'
          }
        },
        required: ['name', 'format', 'terms']
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
      name: 'store_htmlpart',
      description: 'Store an HTML part/fragment for a document. Returns the part ID. Use this to break large HTML content into manageable sections, subsections, tables, or cells.',
      parameters: {
        type: 'object',
        properties: {
          partid: { type: 'string', description: 'Unique identifier for this HTML part (use make_id to generate)' },
          docid: { type: 'string', description: 'Document identifier this part belongs to' },
          html: { type: 'string', description: 'HTML content to store' }
        },
        required: ['partid', 'docid', 'html']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'load_htmlpart',
      description: 'Load a previously stored HTML part by its part ID',
      parameters: {
        type: 'object',
        properties: {
          partid: { type: 'string', description: 'The part ID to retrieve' }
        },
        required: ['partid']
      }
    }
  }
];
