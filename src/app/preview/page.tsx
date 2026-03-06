'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useRef, useCallback, Suspense } from 'react';
import { ArrowLeft, RefreshCw, Globe, Copy, Check } from 'lucide-react';

function PreviewContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const rawUrl = searchParams.get('url') || '';
    const [iframeKey, setIframeKey] = useState(0);
    const [copied, setCopied] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Build display URL (show a clean tunneled-style path)
    const displayUrl = rawUrl
        ? rawUrl.replace(/[?#].*$/, '').replace(/^\/+/, '')
        : '';

    const handleRefresh = useCallback(() => {
        setIframeKey(k => k + 1);
    }, []);

    const handleCopy = useCallback(() => {
        const fullUrl = `${window.location.origin}/${displayUrl}`;
        navigator.clipboard.writeText(fullUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [displayUrl]);

    if (!rawUrl) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-[#0a0a0a] text-white/60">
                <p>No preview URL provided.</p>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen flex flex-col bg-[#0a0a0a] overflow-hidden">
            {/* Header bar */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-[#141414] border-b border-white/[0.06]">
                {/* Back button */}
                <button
                    onClick={() => window.close()}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-all text-sm"
                    title="Close preview"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Editor</span>
                </button>

                {/* URL bar */}
                <div className="flex-1 flex items-center justify-center">
                    <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] max-w-xl w-full">
                        <Globe className="w-3.5 h-3.5 text-[#b69161] flex-shrink-0" />
                        <span className="text-sm text-white/70 truncate font-mono">
                            {displayUrl || '/'}
                        </span>
                        <div className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Live
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleCopy}
                        className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
                        title="Copy URL"
                    >
                        {copied ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                            <Copy className="w-4 h-4" />
                        )}
                    </button>
                    <button
                        onClick={handleRefresh}
                        className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
                        title="Refresh preview"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Preview iframe */}
            <div className="flex-1 relative">
                <iframe
                    ref={iframeRef}
                    key={iframeKey}
                    src={rawUrl}
                    className="absolute inset-0 w-full h-full border-0"
                    title="Website Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
                />
            </div>
        </div>
    );
}

export default function PreviewPage() {
    return (
        <Suspense fallback={
            <div className="h-screen w-screen flex items-center justify-center bg-[#0a0a0a] text-white/60">
                Loading preview...
            </div>
        }>
            <PreviewContent />
        </Suspense>
    );
}
