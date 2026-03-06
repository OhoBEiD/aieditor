'use client';

import { useEffect } from 'react';

export default function WebContainerConnectPage() {
    useEffect(() => {
        // setupConnect is not available in the public @webcontainer/api types
        // but may exist at runtime on StackBlitz. Use dynamic access to avoid TS errors.
        import('@webcontainer/api').then((mod: any) => {
            try {
                if (typeof mod.setupConnect === 'function') {
                    mod.setupConnect();
                } else {
                    throw new Error('setupConnect not available');
                }
            } catch {
                const previewUrl = window.location.pathname;
                window.location.replace(`/preview?url=${encodeURIComponent(previewUrl)}`);
            }
        }).catch(() => {
            const previewUrl = window.location.pathname;
            window.location.replace(`/preview?url=${encodeURIComponent(previewUrl)}`);
        });
    }, []);

    return (
        <div className="h-screen w-screen flex items-center justify-center bg-[#0a0a0a]">
            <div className="flex items-center gap-3 text-white/50">
                <div className="w-5 h-5 border-2 border-[#b69161]/40 border-t-[#b69161] rounded-full animate-spin" />
                <span className="text-sm">Connecting to preview...</span>
            </div>
        </div>
    );
}
