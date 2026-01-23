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
            name: 'generate_image',
            description: 'Get an Unsplash image URL for any image needed. ALWAYS call this for images - returns a ready-to-use URL',
            parameters: {
                type: 'object',
                properties: {
                    prompt: { type: 'string', description: 'Description of the image needed' }
                },
                required: ['prompt']
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
