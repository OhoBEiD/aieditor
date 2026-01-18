'use client';

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Send, Image, X, Square, Zap, Brain, ChevronUp } from 'lucide-react';
import { gsap } from 'gsap';

export type ExecutorMode = 'auto' | 'fast' | 'thinking';

interface MessageInputProps {
    onSend: (message: string, image?: File) => void;
    onStop?: () => void;
    isLoading?: boolean;
    placeholder?: string;
    executorMode?: ExecutorMode;
    onModeChange?: (mode: ExecutorMode) => void;
    showModeSelector?: boolean;
}

export function MessageInput({
    onSend,
    onStop,
    isLoading = false,
    placeholder = "Describe what to change...",
    executorMode = 'thinking',
    onModeChange,
    showModeSelector = true,
}: MessageInputProps) {
    const [message, setMessage] = useState('');
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const dropdownMenuRef = useRef<HTMLDivElement>(null);
    const modeBtnRef = useRef<HTMLButtonElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsModeDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // GSAP animation for dropdown
    useEffect(() => {
        if (!dropdownMenuRef.current) return;

        if (isModeDropdownOpen) {
            // Opening animation
            gsap.fromTo(dropdownMenuRef.current,
                {
                    opacity: 0,
                    y: 10,
                    scale: 0.95,
                },
                {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    duration: 0.25,
                    ease: 'back.out(1.7)',
                }
            );

            // Animate dropdown items with stagger
            const items = dropdownMenuRef.current.querySelectorAll('button');
            gsap.fromTo(items,
                {
                    opacity: 0,
                    x: -10,
                },
                {
                    opacity: 1,
                    x: 0,
                    duration: 0.2,
                    stagger: 0.05,
                    ease: 'power2.out',
                    delay: 0.1,
                }
            );
        } else {
            // Closing animation
            gsap.to(dropdownMenuRef.current, {
                opacity: 0,
                y: 10,
                scale: 0.95,
                duration: 0.15,
                ease: 'power2.in',
            });
        }
    }, [isModeDropdownOpen]);

    // GSAP hover animation for mode button
    useEffect(() => {
        if (!modeBtnRef.current) return;

        const btn = modeBtnRef.current;

        const handleMouseEnter = () => {
            gsap.to(btn, {
                scale: 1.05,
                y: -2,
                duration: 0.2,
                ease: 'power2.out',
            });
        };

        const handleMouseLeave = () => {
            gsap.to(btn, {
                scale: 1,
                y: 0,
                duration: 0.2,
                ease: 'power2.out',
            });
        };

        btn.addEventListener('mouseenter', handleMouseEnter);
        btn.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            btn.removeEventListener('mouseenter', handleMouseEnter);
            btn.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if ((message.trim() || selectedImage) && !isLoading) {
            onSend(message.trim(), selectedImage || undefined);
            setMessage('');
            setSelectedImage(null);
            setImagePreview(null);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            processImageFile(file);
        }
    };

    const processImageFile = (file: File) => {
        if (!file.type.startsWith('image/')) return;
        setSelectedImage(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result as string);
        };
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
                if (file) {
                    processImageFile(file);
                }
                break;
            }
        }
    };

    const removeImage = () => {
        setSelectedImage(null);
        setImagePreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Auto-resize textarea up to max height (~10 lines)
    React.useEffect(() => {
        if (textareaRef.current) {
            const minHeight = 32;
            const maxHeight = 180;

            // If empty, use minimum height
            if (!message.trim()) {
                textareaRef.current.style.height = `${minHeight}px`;
                textareaRef.current.style.overflowY = 'hidden';
                return;
            }

            // Reset height to auto to get the correct scrollHeight
            textareaRef.current.style.height = 'auto';
            // Calculate new height, capped at maxHeight
            const newHeight = Math.max(minHeight, Math.min(textareaRef.current.scrollHeight, maxHeight));
            textareaRef.current.style.height = `${newHeight}px`;
            // Enable scrolling if content exceeds max height
            textareaRef.current.style.overflowY = textareaRef.current.scrollHeight > maxHeight ? 'auto' : 'hidden';
        }
    }, [message]);

    return (
        <div className="flex-shrink-0 p-4">
            {/* Image Preview */}
            {imagePreview && (
                <div className="mb-3 relative inline-block">
                    <img
                        src={imagePreview}
                        alt="Preview"
                        className="h-16 rounded-lg border border-gray-200"
                    />
                    <button
                        onClick={removeImage}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex items-center gap-3">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                />

                {/* Text Input - Auto-expanding textarea */}
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
                    placeholder={placeholder}
                    disabled={isLoading}
                    rows={1}
                    className={cn(
                        'flex-1 px-3 py-1.5 rounded-2xl text-xs resize-none',
                        'bg-white/50 backdrop-blur-sm border border-white/20',
                        'text-gray-900 placeholder:text-gray-500',
                        'focus:outline-none focus:ring-0 focus:bg-white/70 transition-all duration-200',
                        'disabled:opacity-50',
                        'caret-blue-500'
                    )}
                    style={{
                        caretColor: '#3b82f6',
                        minHeight: '32px',
                        maxHeight: '180px' // ~10 lines
                    }}
                />

                {/* Image Upload Button */}
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 p-2 rounded-full text-gray-500 hover:text-blue-600 hover:bg-gray-100 transition-colors"
                    title="Upload image"
                >
                    <Image className="w-4 h-4" />
                </button>

                {/* Send/Stop Button */}
                {isLoading ? (
                    <button
                        type="button"
                        onClick={onStop}
                        className="flex-shrink-0 p-2 rounded-full transition-all bg-red-500 text-white hover:bg-red-600"
                        title="Stop generation"
                    >
                        <Square className="w-4 h-4 fill-current" />
                    </button>
                ) : (
                    <button
                        type="submit"
                        disabled={!message.trim() && !selectedImage}
                        className={cn(
                            'flex-shrink-0 p-2 rounded-full transition-all',
                            (message.trim() || selectedImage)
                                ? 'bg-blue-500 text-white hover:bg-blue-600'
                                : 'bg-gray-200 text-gray-400'
                        )}
                    >
                        <Send className="w-4 h-4" />
                    </button>
                )}
            </form>

            {/* Mode Selector Dropdown - Moved below input */}
            {showModeSelector && onModeChange && (
                <div className="mt-2 relative" ref={dropdownRef}>
                    <button
                        ref={modeBtnRef}
                        type="button"
                        onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100/50 transition-all"
                    >
                        {executorMode === 'thinking' ? (
                            <>
                                <Brain className="w-3.5 h-3.5 text-purple-600" />
                                <span className="text-gray-700">Thinking</span>
                            </>
                        ) : (
                            <>
                                <Zap className="w-3.5 h-3.5 text-amber-500" />
                                <span className="text-gray-700">Fast</span>
                            </>
                        )}
                        <ChevronUp className={cn("w-3 h-3 text-gray-400 transition-transform", isModeDropdownOpen && "rotate-180")} />
                    </button>

                    {/* Dropdown Menu - Opens upward */}
                    {isModeDropdownOpen && (
                        <div ref={dropdownMenuRef} className="absolute bottom-full left-0 mb-2 w-40 bg-white/95 backdrop-blur-md rounded-xl border border-gray-100 shadow-xl origin-bottom-left z-50">
                            <div className="p-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        onModeChange('thinking');
                                        setIsModeDropdownOpen(false);
                                    }}
                                    className={cn(
                                        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-colors",
                                        executorMode === 'thinking' ? "bg-purple-50 text-purple-900" : "hover:bg-gray-50 text-gray-700"
                                    )}
                                >
                                    <div>
                                        <div className="font-medium">Thinking</div>
                                        <div className="text-[10px] opacity-70">Deep reasoning</div>
                                    </div>
                                    {executorMode === 'thinking' && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        onModeChange('fast');
                                        setIsModeDropdownOpen(false);
                                    }}
                                    className={cn(
                                        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-colors",
                                        executorMode === 'fast' ? "bg-amber-50 text-amber-900" : "hover:bg-gray-50 text-gray-700"
                                    )}
                                >
                                    <div>
                                        <div className="font-medium">Fast</div>
                                        <div className="text-[10px] opacity-70">Quick edits</div>
                                    </div>
                                    {executorMode === 'fast' && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
