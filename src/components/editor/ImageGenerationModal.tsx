'use client';

import React, { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
    X,
    Upload,
    Image as ImageIcon,
    Loader2,
    Sparkles,
    Download,
    Copy,
} from 'lucide-react';
import { Button } from '@/components/ui';

interface ImageGenerationModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type GenerationMode = 'text-to-image' | 'image-to-image' | 'extract-logo' | 'screenshot-to-design';

export function ImageGenerationModal({
    isOpen,
    onClose,
}: ImageGenerationModalProps) {
    const [mode, setMode] = useState<GenerationMode>('text-to-image');
    const [prompt, setPrompt] = useState('');
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [estimatedCost, setEstimatedCost] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedImage(file);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleGenerate = async () => {
        if (!prompt && mode !== 'extract-logo') {
            setError('Please enter a prompt');
            return;
        }

        if ((mode === 'image-to-image' || mode === 'screenshot-to-design' || mode === 'extract-logo') && !imagePreview) {
            setError('Please upload an image');
            return;
        }

        setIsGenerating(true);
        setError(null);
        setGeneratedImage(null);

        try {
            const response = await fetch('/api/ai/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode,
                    prompt,
                    image: imagePreview,
                    options: {
                        width: 1024,
                        height: 1024,
                    },
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Image generation failed');
            }

            const data = await response.json();
            setGeneratedImage(data.result.url);
            setEstimatedCost(data.metadata.estimatedCost);
        } catch (err: any) {
            setError(err.message || 'Failed to generate image');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownload = () => {
        if (!generatedImage) return;
        const link = document.createElement('a');
        link.href = generatedImage;
        link.download = `generated-${Date.now()}.png`;
        link.click();
    };

    const handleCopyUrl = async () => {
        if (!generatedImage) return;
        try {
            await navigator.clipboard.writeText(generatedImage);
            alert('Image URL copied to clipboard!');
        } catch {
            alert('Failed to copy URL');
        }
    };

    const handleClose = () => {
        setPrompt('');
        setSelectedImage(null);
        setImagePreview(null);
        setGeneratedImage(null);
        setError(null);
        onClose();
    };

    if (!isOpen) return null;

    const needsImage = mode !== 'text-to-image';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-3xl mx-4 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-2xl shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)] sticky top-0 bg-[var(--bg-secondary)] z-10">
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                            AI Image Generation
                        </h2>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                            Powered by Flux Schnell • {estimatedCost || '$0.003'} per image
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Mode Selection */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                            Generation Mode
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { value: 'text-to-image', label: 'Text to Image', icon: Sparkles },
                                { value: 'image-to-image', label: 'Image to Image', icon: ImageIcon },
                                { value: 'extract-logo', label: 'Extract Logo', icon: Copy },
                                { value: 'screenshot-to-design', label: 'Screenshot → Design', icon: Upload },
                            ].map((option) => {
                                const Icon = option.icon;
                                return (
                                    <button
                                        key={option.value}
                                        onClick={() => setMode(option.value as GenerationMode)}
                                        className={cn(
                                            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                                            mode === option.value
                                                ? 'bg-[var(--accent-primary)] text-white'
                                                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/80'
                                        )}
                                    >
                                        <Icon className="w-4 h-4" />
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Image Upload (for img2img modes) */}
                    {needsImage && (
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                                Upload Image
                            </label>
                            {imagePreview ? (
                                <div className="relative inline-block">
                                    <img
                                        src={imagePreview}
                                        alt="Preview"
                                        className="h-32 rounded-lg border border-[var(--border-default)]"
                                    />
                                    <button
                                        onClick={() => {
                                            setSelectedImage(null);
                                            setImagePreview(null);
                                        }}
                                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex flex-col items-center justify-center py-8 px-6 rounded-lg border-2 border-dashed border-[var(--border-default)] hover:border-[var(--border-hover)] bg-[var(--bg-tertiary)] cursor-pointer transition-all"
                                >
                                    <ImageIcon className="w-8 h-8 text-[var(--text-muted)] mb-2" />
                                    <p className="text-sm text-[var(--text-primary)] font-medium">
                                        Click to upload image
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)] mt-1">
                                        PNG, JPG, WebP up to 10MB
                                    </p>
                                </div>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleImageSelect}
                                className="hidden"
                            />
                        </div>
                    )}

                    {/* Prompt Input */}
                    {mode !== 'extract-logo' && (
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                                Prompt
                            </label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={
                                    mode === 'text-to-image'
                                        ? 'Describe the image you want to generate...'
                                        : 'Describe how to transform the image...'
                                }
                                rows={3}
                                className="w-full px-4 py-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] resize-none"
                            />
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Generated Image */}
                    {generatedImage && (
                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-[var(--text-primary)]">
                                Generated Image
                            </label>
                            <div className="relative rounded-lg overflow-hidden border border-[var(--border-default)]">
                                <img
                                    src={generatedImage}
                                    alt="Generated"
                                    className="w-full"
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="secondary"
                                    onClick={handleDownload}
                                    leftIcon={<Download className="w-4 h-4" />}
                                >
                                    Download
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={handleCopyUrl}
                                    leftIcon={<Copy className="w-4 h-4" />}
                                >
                                    Copy URL
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-default)]">
                    <Button variant="ghost" onClick={handleClose}>
                        Close
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        leftIcon={isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    >
                        {isGenerating ? 'Generating...' : 'Generate'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
