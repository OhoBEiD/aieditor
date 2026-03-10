// Tool definitions for the AI agent
// These match the OpenAI/Anthropic function calling format

export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, { type: string; description?: string }>;
            required: string[];
        };
    };
}

export const TOOLS: ToolDefinition[] = [
    {
        type: 'function',
        function: {
            name: 'list_files',
            description: 'List files in the user\'s WebContainer project (reads from provided context)',
            parameters: {
                type: 'object',
                properties: {
                    pattern: { type: 'string', description: 'Glob pattern to match files (e.g., "src/**/*.tsx")' }
                },
                required: ['pattern']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'read_file',
            description: 'Read file content from the user\'s WebContainer project',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path relative to project root (e.g., "src/app/page.tsx")' },
                    startLine: { type: 'number', description: 'Start line (optional)' },
                    endLine: { type: 'number', description: 'End line (optional)' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'Create or replace entire file in the user\'s WebContainer project',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path relative to project root (e.g., "src/app/page.tsx")' },
                    content: { type: 'string', description: 'Content to write' }
                },
                required: ['path', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'str_replace',
            description: 'Replace exact text in a file in the user\'s WebContainer project',
            parameters: {
                type: 'object',
                properties: {
                    file: { type: 'string', description: 'Path relative to project root (e.g., "src/app/page.tsx")' },
                    old_text: { type: 'string', description: 'Exact text to replace' },
                    new_text: { type: 'string', description: 'New text to insert' }
                },
                required: ['file', 'old_text', 'new_text']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_file',
            description: 'Delete a file from the user\'s WebContainer project',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path relative to project root (e.g., "src/components/OldFile.tsx")' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'web_search',
            description: 'Search the web for current information using Tavily. Use this when you need up-to-date documentation, API references, tutorials, or to research a topic before implementing.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search query (e.g., "Next.js 14 server actions tutorial")' },
                    maxResults: { type: 'number', description: 'Maximum number of results to return (default: 5, max: 10)' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'web_scrape',
            description: 'Fetch and extract readable text content from a URL. Use after web_search to read a specific page in detail, or when the user provides a URL to reference.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'Full URL to scrape (must be http:// or https://)' },
                    maxLength: { type: 'number', description: 'Maximum content length in characters (default: 5000)' }
                },
                required: ['url']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'validate_build',
            description: 'REQUIRED: Call this as your FINAL step after all file changes. Triggers npm run build to verify the project compiles correctly. If build fails, you will receive errors to fix.',
            parameters: {
                type: 'object',
                properties: {
                    message: { type: 'string', description: 'Summary of changes made (e.g., "Created landing page with 5 components")' }
                },
                required: ['message']
            }
        }
    }
];

// Tool result types
export interface FileOperation {
    type: 'write' | 'modify' | 'delete';
    path: string;
    content?: string;
    oldText?: string;
    newText?: string;
}

export type ToolResult = {
    success: boolean;
    data?: string;
    error?: string;
    operation?: FileOperation;
};
