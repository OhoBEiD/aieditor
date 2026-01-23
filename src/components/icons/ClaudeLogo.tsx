import React from 'react';
import { cn } from '@/lib/utils';

export function ClaudeLogo({ className }: { className?: string }) {
    return (
        <img
            src="/image.png"
            alt="Claude"
            className={cn("object-contain", className)}
        />
    );
}
