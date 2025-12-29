'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
    const router = useRouter();

    useEffect(() => {
        const handleCallback = async () => {
            try {
                // Get the code from URL
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    console.error('[Auth Callback] Error:', error);
                    router.push('/login?error=auth_failed');
                    return;
                }

                if (session) {
                    // Store GitHub token if available
                    if (session.provider_token) {
                        await fetch('/api/auth/store-github-token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                accessToken: session.provider_token,
                                refreshToken: session.provider_refresh_token,
                            }),
                        });
                    }
                    router.push('/');
                } else {
                    router.push('/login');
                }
            } catch (err) {
                console.error('[Auth Callback] Error:', err);
                router.push('/login?error=auth_failed');
            }
        };

        handleCallback();
    }, [router]);

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-gray-600">Completing sign in...</p>
            </div>
        </div>
    );
}
