'use client';

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, label, error, ...props }, ref) => {
        return (
            <div className="w-full">
                {label && (
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                        {label}
                    </label>
                )}
                <textarea
                    ref={ref}
                    className={cn(
                        `w-full px-4 py-3 rounded-lg resize-none
            bg-[var(--bg-tertiary)] text-[var(--text-primary)]
            border border-[var(--border-default)]
            placeholder:text-[var(--text-muted)]
            transition-all duration-200
            hover:border-[var(--border-hover)]
            focus:outline-none focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--border-focus)]
            disabled:opacity-50 disabled:cursor-not-allowed`,
                        error && 'border-[var(--accent-danger)] focus:border-[var(--accent-danger)] focus:ring-[var(--accent-danger)]',
                        className
                    )}
                    {...props}
                />
                {error && (
                    <p className="mt-1.5 text-sm text-[var(--accent-danger)]">{error}</p>
                )}
            </div>
        );
    }
);

Textarea.displayName = 'Textarea';
