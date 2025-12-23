import React from 'react';

interface PreviewLoaderProps {
  message?: string;
  stage?: 'initializing' | 'applying' | 'building' | 'ready';
}

export function PreviewLoader({
  message = 'Loading preview...',
  stage = 'initializing'
}: PreviewLoaderProps) {
  const stages = {
    initializing: { label: 'Initializing preview', progress: 25 },
    applying: { label: 'Applying changes', progress: 50 },
    building: { label: 'Building preview', progress: 75 },
    ready: { label: 'Preview ready', progress: 100 },
  };

  const currentStage = stages[stage];

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
      <div className="flex flex-col items-center gap-6 max-w-md w-full px-8">
        {/* Animated spinner */}
        <div className="relative w-20 h-20">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-4 border-border/20"></div>

          {/* Spinning gradient ring */}
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary border-r-primary/60 animate-spin"></div>

          {/* Inner pulsing dot */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 bg-primary rounded-full animate-pulse"></div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">
              {currentStage.label}
            </span>
            <span className="text-primary font-mono text-xs">
              {currentStage.progress}%
            </span>
          </div>

          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary transition-all duration-500 ease-out relative"
              style={{ width: `${currentStage.progress}%` }}
            >
              {/* Shimmer effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
            </div>
          </div>
        </div>

        {/* Message */}
        <p className="text-sm text-muted-foreground text-center animate-pulse">
          {message}
        </p>

        {/* Dots animation */}
        <div className="flex gap-1.5">
          <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
          <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
          <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce"></div>
        </div>
      </div>
    </div>
  );
}

// Simplified version for quick loading states
export function PreviewSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };

  return (
    <div className={`${sizes[size]} rounded-full border-border/20 border-t-primary border-r-primary/60 animate-spin`}></div>
  );
}
