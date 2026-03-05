'use client';

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Send, X, Square, ChevronUp, Check, Paperclip } from 'lucide-react';
import NextImage from 'next/image';
import { ClaudeLogo } from '@/components/icons/ClaudeLogo';
import { ContextIndicator } from './ContextIndicator';
import type { ContextUsage } from '@/hooks/useContextUsage';
import { gsap } from 'gsap';

export type ExecutorMode = 'auto' | 'fast' | 'thinking' | 'mastra';

interface MessageInputProps {
    onSend: (message: string, image?: File) => void;
    onStop?: () => void;
    isLoading?: boolean;
    placeholder?: string;
    executorMode?: ExecutorMode;
    onModeChange?: (mode: ExecutorMode) => void;
    showModeSelector?: boolean;
    contextUsage?: ContextUsage;
}

export function MessageInput({
    onSend,
    onStop,
    isLoading = false,
    placeholder = "Give a followup...",
    executorMode = 'mastra',
    onModeChange,
    showModeSelector: _showModeSelector = true,
    contextUsage,
}: MessageInputProps) {
    const [message, setMessage] = useState('');
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const dropdownMenuRef = useRef<HTMLDivElement>(null);
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        const focusTimer = setTimeout(() => {
            if (textareaRef.current && !isLoading) {
                textareaRef.current.focus();
            }
        }, 100);
        return () => clearTimeout(focusTimer);
    }, [isLoading]);

    const handleFormClick = (e: React.MouseEvent<HTMLFormElement>) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.focus-input-on-click')) {
            e.preventDefault();
            textareaRef.current?.focus();
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsModeDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!dropdownMenuRef.current) return;
        if (isModeDropdownOpen) {
            gsap.fromTo(dropdownMenuRef.current,
                { opacity: 0, y: 10, scale: 0.95 },
                { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: 'back.out(1.7)' }
            );
            const items = dropdownMenuRef.current.querySelectorAll('button');
            gsap.fromTo(items,
                { opacity: 0, x: -10 },
                { opacity: 1, x: 0, duration: 0.2, stagger: 0.05, ease: 'power2.out', delay: 0.1 }
            );
        } else {
            gsap.to(dropdownMenuRef.current, {
                opacity: 0, y: 10, scale: 0.95, duration: 0.15, ease: 'power2.in',
            });
        }
    }, [isModeDropdownOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if ((message.trim() || selectedImage) && !isLoading) {
            onSend(message.trim(), selectedImage || undefined);
            setMessage('');
            setSelectedImage(null);
            setImagePreview(null);
        }
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processImageFile(file);
    };

    const processImageFile = (file: File) => {
        if (!file.type.startsWith('image/')) return;
        setSelectedImage(file);
        const reader = new FileReader();
        reader.onloadend = () => setImagePreview(reader.result as string);
        reader.readAsDataURL(file);
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) processImageFile(file);
                break;
            }
        }
    };

    const removeImage = () => {
        setSelectedImage(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    React.useEffect(() => {
        if (textareaRef.current) {
            const minHeight = 36;
            const maxHeight = 180;
            if (!message.trim()) {
                textareaRef.current.style.height = `${minHeight}px`;
                textareaRef.current.style.overflowY = 'hidden';
                return;
            }
            textareaRef.current.style.height = 'auto';
            const newHeight = Math.max(minHeight, Math.min(textareaRef.current.scrollHeight, maxHeight));
            textareaRef.current.style.height = `${newHeight}px`;
            textareaRef.current.style.overflowY = textareaRef.current.scrollHeight > maxHeight ? 'auto' : 'hidden';
        }
    }, [message]);

    return (
        <div className="flex-shrink-0 px-3 pb-3 pt-2 relative z-50">
            {/* Image Preview */}
            {imagePreview && (
                <div className="mb-2 relative inline-block">
                    <img
                        src={imagePreview}
                        alt="Preview"
                        className="h-14 rounded-lg border border-[#b69161]/15"
                    />
                    <button
                        onClick={removeImage}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            )}

            {/* Input field */}
            <form
                ref={formRef}
                onSubmit={handleSubmit}
                onClick={handleFormClick}
                className="relative bg-[#f2efed] rounded-2xl border border-[#b69161]/25 transition-colors focus-input-on-click cursor-text"
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                />

                <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e);
                        }
                    }}
                    onPaste={handlePaste}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={placeholder}
                    disabled={isLoading}
                    rows={1}
                    autoFocus
                    className={cn(
                        'w-full px-4 pt-3 pb-2 rounded-2xl text-sm resize-none',
                        'bg-transparent border-0',
                        'text-[#2c2418] placeholder:text-[#a89d8e]',
                        'focus:outline-none focus:ring-0 transition-all duration-200',
                        'disabled:opacity-50',
                        'caret-[#b69161]'
                    )}
                    style={{
                        caretColor: '#b69161',
                        minHeight: '36px',
                        maxHeight: '180px'
                    }}
                />

                {/* Bottom row inside input: actions */}
                <div className="flex items-center justify-between px-3 pb-2.5">
                    <div />
                    <div className="flex items-center gap-1">
                        {/* Image upload */}
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="p-1.5 rounded-lg text-[#b69161]/60 hover:text-[#b69161] hover:bg-[#b69161]/10 transition-colors"
                            title="Attach image"
                        >
                            <Paperclip className="w-4 h-4" />
                        </button>

                        {/* Send / Stop */}
                        {isLoading ? (
                            <button
                                type="button"
                                onClick={onStop}
                                className="p-1.5 rounded-lg bg-[#2c2418] text-white hover:bg-[#4a3f32] transition-colors"
                                title="Stop generation"
                            >
                                <Square className="w-4 h-4 fill-current" />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={!message.trim() && !selectedImage}
                                className={cn(
                                    'p-1.5 rounded-lg transition-colors',
                                    (message.trim() || selectedImage)
                                        ? 'bg-[#b69161] text-white hover:bg-[#c9a474]'
                                        : 'bg-[#d6cfc9]/50 text-[#a89d8e]'
                                )}
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </form>

            {/* Bottom bar: Agent + Model selectors */}
            <div className="flex items-center justify-between mt-2 px-1" ref={dropdownRef}>
                <div className="flex items-center gap-2">
                    {/* Agent selector pill */}
                    <button
                        type="button"
                        onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
                        className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border",
                            "bg-[#d6cfc9]/30 text-[#84745b] border-[#b69161]/20 hover:bg-[#b69161]/10 hover:text-[#84745b]"
                        )}
                    >
                        {executorMode === 'mastra' ? (
                            <>
                                <NextImage src="/automatelogo.png" alt="" width={14} height={14} className="object-contain" />
                                <span>Automate</span>
                            </>
                        ) : (
                            <>
                                <ClaudeLogo className="w-3.5 h-3.5" />
                                <span>Claude Code</span>
                            </>
                        )}
                        <ChevronUp className={cn(
                            "w-3 h-3 transition-transform",
                            isModeDropdownOpen && "rotate-180"
                        )} />
                    </button>
                </div>

                {/* Context usage indicator */}
                {contextUsage && <ContextIndicator usage={contextUsage} />}

                {/* Dropdown Menu */}
                {isModeDropdownOpen && (
                    <div
                        ref={dropdownMenuRef}
                        className="absolute bottom-full left-1 mb-2 w-52 bg-[#f2efed] rounded-xl shadow-2xl border border-[#b69161]/20 overflow-hidden"
                    >
                        {/* Claude Code */}
                        <button
                            type="button"
                            onClick={() => {
                                onModeChange?.('thinking');
                                setIsModeDropdownOpen(false);
                            }}
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                                executorMode !== 'mastra'
                                    ? "bg-[#b69161]/10"
                                    : "hover:bg-[#b69161]/5"
                            )}
                        >
                            <ClaudeLogo className="w-4 h-4 text-[#84745b]" />
                            <div className="flex-1">
                                <div className="text-sm font-medium text-[#2c2418]">Claude Code</div>
                                <div className="text-xs text-[#7a6f60]">Anthropic Claude</div>
                            </div>
                            {executorMode !== 'mastra' && (
                                <Check className="w-4 h-4 text-[#b69161]" />
                            )}
                        </button>

                        {/* Automate */}
                        <button
                            type="button"
                            onClick={() => {
                                onModeChange?.('mastra');
                                setIsModeDropdownOpen(false);
                            }}
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                                executorMode === 'mastra'
                                    ? "bg-[#b69161]/10"
                                    : "hover:bg-[#b69161]/5"
                            )}
                        >
                            <NextImage src="/automatelogo.png" alt="" width={16} height={16} className="object-contain" />
                            <div className="flex-1">
                                <div className="text-sm font-medium text-[#2c2418]">Automate Editor</div>
                                <div className="text-xs text-[#7a6f60]">Custom AI</div>
                            </div>
                            {executorMode === 'mastra' && (
                                <Check className="w-4 h-4 text-[#b69161]" />
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
