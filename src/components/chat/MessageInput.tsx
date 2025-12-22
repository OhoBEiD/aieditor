'use client';

import React, { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Send, Image, X, Loader2 } from 'lucide-react';

interface MessageInputProps {
    onSend: (message: string, image?: File) => void;
    isLoading?: boolean;
    placeholder?: string;
}

export function MessageInput({
    onSend,
    isLoading = false,
    placeholder = "Describe what to change...",
}: MessageInputProps) {
    const [message, setMessage] = useState('');
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
            // Reset height to auto to get the correct scrollHeight
            textareaRef.current.style.height = 'auto';
            // Calculate new height, capped at 200px (~10 lines)
            const maxHeight = 200;
            const newHeight = Math.min(textareaRef.current.scrollHeight, maxHeight);
            textareaRef.current.style.height = `${newHeight}px`;
            // Enable scrolling if content exceeds max height
            textareaRef.current.style.overflowY = textareaRef.current.scrollHeight > maxHeight ? 'auto' : 'hidden';
        }
    }, [message]);

    return (
        <div className="flex-shrink-0 p-4 border-t border-[var(--border-default)] bg-[var(--bg-secondary)]">
            {/* Image Preview */}
            {imagePreview && (
                <div className="mb-3 relative inline-block">
                    <img
                        src={imagePreview}
                        alt="Preview"
                        className="h-16 rounded-lg border border-[var(--border-default)]"
                    />
                    <button
                        onClick={removeImage}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--accent-danger)] text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex items-center gap-3">
                {/* Image Upload Button */}
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 p-2 rounded-full text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    title="Upload image"
                >
                    <Image className="w-4 h-4" />
                </button>
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
                        'bg-[var(--bg-tertiary)]',
                        'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                        'focus:outline-none focus:ring-0 border-none outline-none',
                        'disabled:opacity-50',
                        'caret-[var(--accent-primary)]'
                    )}
                    style={{
                        caretColor: 'var(--accent-primary)',
                        minHeight: '32px',
                        maxHeight: '180px' // ~10 lines
                    }}
                />

                {/* Send Button - Navy background */}
                <button
                    type="submit"
                    disabled={(!message.trim() && !selectedImage) || isLoading}
                    className={cn(
                        'flex-shrink-0 p-2 rounded-full transition-all',
                        (message.trim() || selectedImage) && !isLoading
                            ? 'bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary-hover)]'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-disabled)]'
                    )}
                >
                    {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Send className="w-4 h-4" />
                    )}
                </button>
            </form>

            <a
                href="https://automatelb.com"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block text-[10px] text-[var(--text-muted)] text-center hover:text-[var(--accent-primary)] transition-colors"
            >
                Developed by <span className="font-medium text-[var(--accent-primary)]" style={{ fontFamily: 'var(--font-oxanium)' }}>AutoMate</span>
            </a>
        </div>
    );
}
