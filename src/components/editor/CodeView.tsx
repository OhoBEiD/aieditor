'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileTree } from './FileTree';
import { CodeEditor } from './CodeEditor';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import { gsap } from 'gsap';

interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: FileNode[];
}

interface CodeViewProps {
    // Function to list files from WebContainer
    listFiles: () => Promise<string[]>;
    // Function to read file content from WebContainer
    readFile: (path: string) => Promise<string>;
    // Function to write file content (optional)
    writeFile?: (path: string, content: string) => Promise<void>;
    className?: string;
    // External file selection (from chat panel clicking on file names)
    externalSelectedFile?: string | null;
}

function buildTreeFromPaths(paths: string[]): FileNode[] {
    const tree: FileNode[] = [];
    const nodeMap: Map<string, FileNode> = new Map();

    for (const path of paths) {
        const parts = path.split('/');
        let parentPath = '';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const currentPath = parts.slice(0, i + 1).join('/');
            const isFile = i === parts.length - 1;

            if (!nodeMap.has(currentPath)) {
                const node: FileNode = {
                    name: part,
                    path: currentPath,
                    type: isFile ? 'file' : 'directory',
                    children: isFile ? undefined : [],
                };
                nodeMap.set(currentPath, node);

                if (parentPath) {
                    const parent = nodeMap.get(parentPath);
                    if (parent && parent.children) {
                        parent.children.push(node);
                    }
                } else {
                    tree.push(node);
                }
            }
            parentPath = currentPath;
        }
    }

    const sortNodes = (nodes: FileNode[]): FileNode[] => {
        return nodes.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
        }).map(node => ({
            ...node,
            children: node.children ? sortNodes(node.children) : undefined,
        }));
    };

    return sortNodes(tree);
}

export function CodeView({ listFiles, readFile, writeFile, className, externalSelectedFile }: CodeViewProps) {
    const [files, setFiles] = useState<FileNode[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [allFilePaths, setAllFilePaths] = useState<string[]>([]);

    useEffect(() => {
        const loadFiles = async () => {
            try {
                setIsLoading(true);
                const paths = await listFiles();
                setAllFilePaths(paths);
                const tree = buildTreeFromPaths(paths);
                setFiles(tree);
            } catch (e) {
                console.error('Failed to list files:', e);
            } finally {
                setIsLoading(false);
            }
        };
        loadFiles();
    }, [listFiles]);

    // Handle external file selection from chat panel
    useEffect(() => {
        if (externalSelectedFile && allFilePaths.length > 0) {
            // Try to find a file that matches the filename
            const fileName = externalSelectedFile.toLowerCase();
            const matchingPath = allFilePaths.find(p =>
                p.toLowerCase().endsWith(fileName) ||
                p.toLowerCase().endsWith('/' + fileName)
            );

            if (matchingPath) {
                handleFileSelect(matchingPath);
            }
        }
    }, [externalSelectedFile, allFilePaths]);

    const handleFileSelect = useCallback(async (path: string) => {
        setSelectedFile(path);
        try {
            const content = await readFile(path);
            setFileContent(content);
        } catch (e) {
            console.error('Failed to read file:', e);
            setFileContent(`// Failed to read ${path}`);
        }
    }, [readFile]);

    const handleContentChange = useCallback(async (content: string) => {
        setFileContent(content);
        if (selectedFile && writeFile) {
            try {
                await writeFile(selectedFile, content);
            } catch (e) {
                console.error('Failed to save file:', e);
            }
        }
    }, [selectedFile, writeFile]);

    // GSAP Animation
    useEffect(() => {
        const ctx = gsap.context(() => {
            gsap.fromTo(".file-sidebar",
                { x: -20, opacity: 0 },
                { x: 0, opacity: 1, duration: 0.5, ease: "power2.out", delay: 0.1 }
            );
            gsap.fromTo(".editor-breadcrumbs",
                { y: -10, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.4, ease: "power2.out", delay: 0.2 }
            );
        });
        return () => ctx.revert();
    }, []);

    const glassStyle = "backdrop-blur-xl bg-white/30 border border-white/20 rounded-2xl shadow-[0_8px_32px_0_rgba(31,38,135,0.37)]";

    return (
        <div className={cn("flex h-full font-sans bg-transparent py-4 px-4 gap-4", className)}>
            {/* Sidebar - File Tree - Liquid Glass */}
            <div className={cn("w-80 flex-shrink-0 flex flex-col file-sidebar overflow-hidden", glassStyle)}>
                {/* Search */}
                <div className="p-4 border-b border-white/10">
                    <div className="flex items-center gap-2 px-3 py-2 bg-white/20 border border-white/10 rounded-xl transition-all shadow-inner focus-within:bg-white/40">
                        <Search className="w-4 h-4 text-gray-800" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent text-black placeholder-gray-500 outline-none flex-1 text-sm font-medium"
                        />
                    </div>
                </div>

                {/* File Tree */}
                {isLoading ? (
                    <div className="flex items-center justify-center p-4 text-gray-800 text-sm font-medium">
                        Loading files...
                    </div>
                ) : (
                    <FileTree
                        files={files}
                        selectedFile={selectedFile || undefined}
                        onFileSelect={handleFileSelect}
                        className="p-2"
                    />
                )}
            </div>

            {/* Main Editor Area */}
            <div className="flex-1 flex flex-col bg-transparent relative z-10 gap-4">
                {selectedFile ? (
                    <>
                        {/* Editor Header / Breadcrumbs - Liquid Glass */}
                        <div className={cn("editor-breadcrumbs flex items-center px-6 h-14 shrink-0 shadow-sm", glassStyle)}>
                            <div className="flex items-center gap-2 text-sm text-gray-900 font-medium">
                                <Search className="w-4 h-4 text-gray-900" />
                                <span className="text-gray-400 mx-1">/</span>
                                {selectedFile.split('/').map((part, i, arr) => (
                                    <div key={i} className="flex items-center gap-1">
                                        <span className={cn(
                                            "transition-colors px-2 py-0.5 rounded-lg",
                                            i === arr.length - 1
                                                ? "text-black font-bold bg-white/40 shadow-sm border border-white/10"
                                                : "text-gray-700 hover:text-black cursor-pointer hover:bg-white/20"
                                        )}>
                                            {part}
                                        </span>
                                        {i < arr.length - 1 && <span className="text-gray-300">/</span>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Editor Content - passed to CodeEditor */}
                        <div className="flex-1 relative">
                            <CodeEditor
                                filePath={selectedFile}
                                content={fileContent}
                                onChange={handleContentChange}
                                className="!mx-0 !mb-0 !mt-0" // Reset internal margins to use flex gap
                            />
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col gap-4">
                        <div className={cn("h-14 shrink-0 shadow-sm", glassStyle)} />
                        <div className={cn("flex-1 shadow-sm", glassStyle)} />
                    </div>
                )}
            </div>
        </div>
    );
}
