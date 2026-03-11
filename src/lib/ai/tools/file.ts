// File operations tool implementations
// These collect operations for WebContainer to apply

import { ToolResult, FileOperation } from './index';

interface FileContext {
    [path: string]: string;
}

// Collected file operations to be applied by WebContainer
let fileOperations: FileOperation[] = [];

export function resetOperations() {
    fileOperations = [];
}

export function getOperations(): FileOperation[] {
    return [...fileOperations];
}

export function listFiles(context: FileContext, pattern: string): ToolResult {
    const files = Object.keys(context);
    if (files.length === 0) {
        return {
            success: true,
            data: 'No files in context. This is a new project - create files with write_file.'
        };
    }
    return {
        success: true,
        data: files.join('\n')
    };
}

export function readFile(context: FileContext, path: string, startLine?: number, endLine?: number): ToolResult {
    const content = context[path];
    if (!content) {
        return {
            success: true,
            data: `File "${path}" not in context. Use write_file to create it.`
        };
    }

    if (startLine !== undefined || endLine !== undefined) {
        const lines = content.split('\n');
        const start = Math.max(0, (startLine || 1) - 1);
        const end = Math.min(lines.length, endLine || lines.length);
        const slice = lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n');
        return { success: true, data: slice.slice(0, 6000) };
    }

    return { success: true, data: content.slice(0, 8000) };
}

export function writeFile(path: string, content: string): ToolResult {
    const operation: FileOperation = { type: 'write', path, content };
    fileOperations.push(operation);
    return {
        success: true,
        data: JSON.stringify({ success: true, file: path, action: 'queued_for_write' }),
        operation
    };
}

export function strReplace(file: string, oldText: string, newText: string): ToolResult {
    const operation: FileOperation = { type: 'modify', path: file, oldText, newText };
    fileOperations.push(operation);
    return {
        success: true,
        data: JSON.stringify({ success: true, file, action: 'queued_for_modify' }),
        operation
    };
}

export function deleteFile(path: string): ToolResult {
    const operation: FileOperation = { type: 'delete', path };
    fileOperations.push(operation);
    return {
        success: true,
        data: JSON.stringify({ success: true, file: path, action: 'queued_for_delete' }),
        operation
    };
}
