'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
    ChevronRight,
    ChevronDown,
    File,
    Folder,
    FolderOpen,
    FileCode,
    FileJson,
    FileType,
    FileText,
} from 'lucide-react';

interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileNode[];
    isModified?: boolean;
}

interface FileBrowserProps {
    files: FileNode[];
    selectedFile: string | null;
    onSelectFile: (path: string) => void;
    className?: string;
}

export function FileBrowser({
    files,
    selectedFile,
    onSelectFile,
    className,
}: FileBrowserProps) {
    return (
        <div className={cn('h-full flex flex-col bg-[var(--bg-secondary)]', className)}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-default)]">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Files</h3>
            </div>

            {/* File Tree */}
            <div className="flex-1 overflow-y-auto p-2">
                {files.length === 0 ? (
                    <div className="text-center py-8">
                        <Folder className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-2" />
                        <p className="text-sm text-[var(--text-muted)]">No files loaded</p>
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {files.map((node) => (
                            <FileTreeNode
                                key={node.path}
                                node={node}
                                selectedFile={selectedFile}
                                onSelectFile={onSelectFile}
                                level={0}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

interface FileTreeNodeProps {
    node: FileNode;
    selectedFile: string | null;
    onSelectFile: (path: string) => void;
    level: number;
}

function FileTreeNode({
    node,
    selectedFile,
    onSelectFile,
    level,
}: FileTreeNodeProps) {
    const [isOpen, setIsOpen] = useState(level < 2);
    const isFolder = node.type === 'folder';
    const isSelected = selectedFile === node.path;

    const getFileIcon = (filename: string) => {
        const ext = filename.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'js':
            case 'jsx':
            case 'ts':
            case 'tsx':
                return <FileCode className="w-4 h-4 text-yellow-400" />;
            case 'css':
            case 'scss':
                return <FileType className="w-4 h-4 text-blue-400" />;
            case 'json':
                return <FileJson className="w-4 h-4 text-yellow-500" />;
            case 'html':
                return <FileCode className="w-4 h-4 text-orange-400" />;
            case 'md':
                return <FileText className="w-4 h-4 text-gray-400" />;
            default:
                return <File className="w-4 h-4 text-[var(--text-muted)]" />;
        }
    };

    const handleClick = () => {
        if (isFolder) {
            setIsOpen(!isOpen);
        } else {
            onSelectFile(node.path);
        }
    };

    return (
        <div>
            <button
                onClick={handleClick}
                className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left',
                    'text-sm transition-colors duration-150',
                    isSelected
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                )}
                style={{ paddingLeft: `${8 + level * 16}px` }}
            >
                {isFolder ? (
                    <>
                        {isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-muted)]" />
                        ) : (
                            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-muted)]" />
                        )}
                        {isOpen ? (
                            <FolderOpen className="w-4 h-4 flex-shrink-0 text-[var(--accent-primary)]" />
                        ) : (
                            <Folder className="w-4 h-4 flex-shrink-0 text-[var(--accent-primary)]" />
                        )}
                    </>
                ) : (
                    <>
                        <span className="w-3.5" />
                        {getFileIcon(node.name)}
                    </>
                )}
                <span className="truncate">{node.name}</span>
                {node.isModified && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-warning)] flex-shrink-0" />
                )}
            </button>

            {isFolder && isOpen && node.children && (
                <div>
                    {node.children.map((child) => (
                        <FileTreeNode
                            key={child.path}
                            node={child}
                            selectedFile={selectedFile}
                            onSelectFile={onSelectFile}
                            level={level + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
