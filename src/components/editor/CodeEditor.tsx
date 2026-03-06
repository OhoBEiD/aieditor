'use client';

import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { cn } from '@/lib/utils';
import { X, Loader2 } from 'lucide-react';
import { gsap } from 'gsap';
import Image from 'next/image';

interface CodeEditorProps {
    filePath: string;
    content: string;
    onChange?: (content: string) => void;
    onClose?: () => void;
    className?: string;
}

// Determine language from file extension
function getLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
        'ts': 'typescript',
        'tsx': 'typescript',
        'js': 'javascript',
        'jsx': 'javascript',
        'json': 'json',
        'css': 'css',
        'scss': 'scss',
        'html': 'html',
        'md': 'markdown',
        'py': 'python',
        'yaml': 'yaml',
        'yml': 'yaml',
    };
    return languageMap[ext || ''] || 'plaintext';
}

export function CodeEditor({ filePath, content, onChange, onClose, className }: CodeEditorProps) {
    const filename = filePath.split('/').pop() || filePath;
    const language = getLanguage(filePath);

    useEffect(() => {
        // Animation
        const ctx = gsap.context(() => {
            gsap.fromTo(".code-editor-container",
                { opacity: 0, y: 10, scale: 0.98 },
                { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "power2.out" }
            );
        });
        return () => ctx.revert();
    }, []);

    return (
        <div className={cn("flex flex-col h-full bg-transparent code-editor-container", className)}>
            {/* Editor Card - Dark Glass */}
            <div className="flex-1 border border-[rgba(182,145,97,0.22)] rounded-2xl overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.35)] mx-4 mb-4 mt-2 bg-[rgba(44,36,24,0.82)] backdrop-blur-xl relative">
                <style jsx global>{`
                    .monaco-editor, .monaco-editor-background, .monaco-editor .inputarea.ime-input {
                        background-color: transparent !important;
                    }
                    .monaco-editor .margin {
                        background-color: transparent !important;
                    }
                    /* Subtle line numbers */
                    .monaco-editor .line-numbers {
                        color: rgba(182, 145, 97, 0.25) !important;
                    }
                `}</style>
                <Editor
                    height="100%"
                    language={language}
                    value={content}
                    theme="vs-dark"
                    onChange={(value) => onChange?.(value || '')}
                    loading={
                        <div className="flex flex-col items-center justify-center h-full w-full bg-transparent backdrop-blur-xl">
                            <div className="flex flex-col items-center gap-3">
                                <Image
                                    src="/automatelogo.png"
                                    alt="Automate"
                                    width={40}
                                    height={40}
                                    className="animate-pulse"
                                />
                                <div className="flex items-center gap-2 text-[#c9a474]/50">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span className="text-sm font-medium">Loading editor...</span>
                                </div>
                            </div>
                        </div>
                    }
                    options={{
                        fontSize: 12,
                        fontFamily: "'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
                        minimap: { enabled: true, scale: 0.75, renderCharacters: false },
                        scrollBeyondLastLine: false,
                        lineNumbers: 'on',
                        glyphMargin: false,
                        folding: true,
                        renderLineHighlight: 'none',
                        cursorBlinking: 'smooth',
                        smoothScrolling: true,
                        padding: { top: 24, bottom: 24 },
                        automaticLayout: true,
                        scrollbar: {
                            verticalScrollbarSize: 10,
                            horizontalScrollbarSize: 10,
                            useShadows: false
                        },
                        overviewRulerBorder: false,
                        hideCursorInOverviewRuler: true,
                    }}
                />
            </div>
        </div>
    );
}
