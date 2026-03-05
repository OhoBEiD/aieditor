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
                return <FileCode className="w-4 h-4 text-[#f1e05a]" />;
            case 'ts':
            case 'tsx':
                return <FileCode className="w-4 h-4 text-[#3178c6]" />;
            case 'css':
                return <FileType className="w-4 h-4 text-[#563d7c]" />;
            case 'scss':
                return <FileType className="w-4 h-4 text-[#c6538c]" />;
            case 'json':
                return <FileJson className="w-4 h-4 text-[#f1e05a]" />;
            case 'html':
                return <FileCode className="w-4 h-4 text-[#e34c26]" />;
            case 'md':
                return <FileText className="w-4 h-4 text-[#455061]" />;
            default:
                return <File className="w-4 h-4 text-[#a89d8e]" />;
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
                    'w-full flex items-center gap-1.5 px-2 py-[3px] rounded-sm text-left group border border-transparent',
                    'text-[13px] transition-colors duration-75 font-mono',
                    isSelected
                        ? 'bg-[#d6cfc9]/40 text-[#2c2418] border-[#b69161]/30'
                        : 'text-[#7a6f60] hover:bg-[#d6cfc9]/30 hover:text-[#2c2418]'
                )}
                style={{ paddingLeft: `${12 + level * 12}px` }}
            >
                {isFolder ? (
                    <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100">
                        {isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5 text-[#a89d8e]" />
                        ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-[#a89d8e]" />
                        )}
                        {isOpen ? (
                            <FolderOpen className="w-4 h-4 text-[#7ee787]" />
                        ) : (
                            <Folder className="w-4 h-4 text-[#7ee787]" />
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5">
                        <span className="w-3.5" />
                        {getFileIcon(node.name)}
                    </div>
                )}
                <span className="truncate flex-1">{node.name}</span>
                {node.isModified && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#d2a8ff] flex-shrink-0" />
                )}
            </button>

            {isFolder && isOpen && node.children && (
                <div className="relative">
                    {/* Indentation guide could go here */}
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
