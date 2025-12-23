import React from 'react';

interface PreviewLoaderProps {
  message?: string;
  stage?: 'initializing' | 'applying' | 'building' | 'ready';
}

export function PreviewLoader({
  message = 'Loading preview...',
  stage = 'initializing'
}: PreviewLoaderProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
      <div className="loader-container">
        <div className="circle" />
        <div className="circle" />
        <div className="circle" />
        <div className="circle" />
      </div>

      <style jsx>{`
        .loader-container {
          --dim: 3rem;
          width: var(--dim);
          height: var(--dim);
          position: relative;
          animation: spin988 2s linear infinite;
        }

        .loader-container .circle {
          --color: hsl(var(--primary));
          --dim: 1.2rem;
          width: var(--dim);
          height: var(--dim);
          background-color: var(--color);
          border-radius: 50%;
          position: absolute;
        }

        .loader-container .circle:nth-child(1) {
          top: 0;
          left: 0;
        }

        .loader-container .circle:nth-child(2) {
          top: 0;
          right: 0;
        }

        .loader-container .circle:nth-child(3) {
          bottom: 0;
          left: 0;
        }

        .loader-container .circle:nth-child(4) {
          bottom: 0;
          right: 0;
        }

        @keyframes spin988 {
          0% {
            transform: scale(1) rotate(0);
          }

          20%, 25% {
            transform: scale(1.3) rotate(90deg);
          }

          45%, 50% {
            transform: scale(1) rotate(180deg);
          }

          70%, 75% {
            transform: scale(1.3) rotate(270deg);
          }

          95%, 100% {
            transform: scale(1) rotate(360deg);
          }
        }
      `}</style>
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
