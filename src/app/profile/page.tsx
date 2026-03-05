'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Github, Database, Loader2, Check, X, ExternalLink, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { useAuth } from '@/contexts/AuthContext';
import VantaFogBackground from '@/components/common/VantaFogBackground';
import { supabase } from '@/lib/supabase/client';

interface ConnectionStatus {
    loading: boolean;
    connected: boolean;
    details?: Record<string, any>;
    error?: string;
}

export default function ProfilePage() {
    const router = useRouter();
    const { user, isAuthenticated, isLoading: authLoading, signInWithGitHub, signOut } = useAuth();

    const logoRef = useRef<HTMLDivElement>(null);
    const brandRef = useRef<HTMLSpanElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const [github, setGithub] = useState<ConnectionStatus>({ loading: true, connected: false });
    const [supabaseStatus, setSupabaseStatus] = useState<ConnectionStatus>({ loading: true, connected: false });

    // GSAP entry animations
    useEffect(() => {
        const ctx = gsap.context(() => {
            const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
            tl.fromTo(logoRef.current, { y: -20, opacity: 0, rotation: -90 }, { y: 0, opacity: 1, rotation: 0, duration: 0.6 });
            tl.fromTo(brandRef.current, { x: -20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4 }, '-=0.4');
            tl.fromTo(contentRef.current, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, '-=0.2');
        });
        return () => ctx.revert();
    }, []);

    // Redirect if not authenticated
    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            router.push('/');
        }
    }, [authLoading, isAuthenticated, router]);

    // Check GitHub connection
    useEffect(() => {
        if (!isAuthenticated) return;
        checkGitHub();
    }, [isAuthenticated]);

    // Check Supabase connection
    useEffect(() => {
        if (!isAuthenticated) return;
        checkSupabase();
    }, [isAuthenticated]);

    async function checkGitHub() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setGithub({ loading: false, connected: false });
                return;
            }
            const res = await fetch('/api/github/token', {
                headers: { 'Authorization': `Bearer ${session.access_token}` },
            });
            const data = await res.json();
            setGithub({
                loading: false,
                connected: data.connected,
                details: data.connected ? { username: data.username, avatarUrl: data.avatarUrl } : undefined,
                error: data.expired ? 'Token expired. Please reconnect.' : undefined,
            });
        } catch {
            setGithub({ loading: false, connected: false, error: 'Failed to check connection' });
        }
    }

    async function checkSupabase() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setSupabaseStatus({ loading: false, connected: false });
                return;
            }
            const res = await fetch('/api/supabase-connection/user-status', {
                headers: { 'Authorization': `Bearer ${session.access_token}` },
            });
            const data = await res.json();
            setSupabaseStatus({
                loading: false,
                connected: data.connected,
                details: data.connected ? { projectCount: data.projectCount } : undefined,
            });
        } catch {
            setSupabaseStatus({ loading: false, connected: false, error: 'Failed to check connection' });
        }
    }

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[#b69161]" />
            </div>
        );
    }

    const avatarUrl = github.details?.avatarUrl || user?.user_metadata?.avatar_url;
    const displayName = user?.user_metadata?.full_name || user?.user_metadata?.user_name || user?.email?.split('@')[0] || 'User';
    const email = user?.email || '';
    const githubUsername = github.details?.username || user?.user_metadata?.user_name;

    return (
        <div className="relative min-h-screen w-full overflow-hidden" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <div className="fixed inset-0 z-0 pointer-events-none">
                <VantaFogBackground />
            </div>

            {/* Header */}
            <header className="relative z-20 flex items-center justify-between px-8 py-6">
                <Link href="/" className="flex items-center gap-4">
                    <div ref={logoRef} className="relative w-16 h-16 opacity-0">
                        <Image src="/automatelogo.png" alt="Automate Logo" fill className="object-contain drop-shadow-xl" />
                    </div>
                    <span ref={brandRef} className="text-2xl font-bold text-[#2c2418] opacity-0 tracking-tight">
                        Automate
                    </span>
                </Link>
            </header>

            {/* Content */}
            <main ref={contentRef} className="relative z-10 max-w-2xl mx-auto px-6 py-8 opacity-0">
                {/* Back button */}
                <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#84745b] hover:text-[#2c2418] transition-colors mb-8">
                    <ArrowLeft className="w-4 h-4" />
                    Back to home
                </Link>

                {/* Profile Header */}
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#b69161]/10 p-6 mb-6">
                    <div className="flex items-center gap-4">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt={displayName} className="w-16 h-16 rounded-full border-2 border-[#b69161]/20" />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-[#b69161]/10 flex items-center justify-center text-xl font-bold text-[#b69161]">
                                {displayName[0]?.toUpperCase()}
                            </div>
                        )}
                        <div className="flex-1">
                            <h1 className="text-xl font-bold text-[#2c2418]">{displayName}</h1>
                            <p className="text-sm text-[#84745b]">{email}</p>
                            {githubUsername && (
                                <p className="text-xs text-[#b69161] mt-0.5">@{githubUsername}</p>
                            )}
                        </div>
                        <button
                            onClick={() => signOut()}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-[#84745b] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            Sign out
                        </button>
                    </div>
                </div>

                {/* Connected Services */}
                <h2 className="text-sm font-semibold text-[#84745b] uppercase tracking-wider mb-4">Connected Services</h2>

                <div className="space-y-4">
                    {/* GitHub Card */}
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#b69161]/10 p-5">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[#2c2418] flex items-center justify-center">
                                    <Github className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-[#2c2418]">GitHub</h3>
                                    <p className="text-xs text-[#84745b]">Sync projects to repositories</p>
                                </div>
                            </div>
                            {github.loading ? (
                                <Loader2 className="w-4 h-4 animate-spin text-[#b69161]/50" />
                            ) : github.connected ? (
                                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                                    <Check className="w-3 h-3" />
                                    Connected
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 text-xs font-medium text-[#84745b] bg-[#d6cfc9]/30 px-2.5 py-1 rounded-full">
                                    <X className="w-3 h-3" />
                                    Not connected
                                </span>
                            )}
                        </div>

                        {!github.loading && (
                            <>
                                {github.connected && github.details?.username && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-[#f5f0eb] rounded-lg mb-3">
                                        <img src={github.details.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
                                        <span className="text-xs font-medium text-[#2c2418]">@{github.details.username}</span>
                                        <span className="text-xs text-[#84745b]">Connected via OAuth</span>
                                    </div>
                                )}
                                {github.error && (
                                    <p className="text-xs text-amber-600 mb-3">{github.error}</p>
                                )}
                                {!github.connected && (
                                    <button
                                        onClick={() => signInWithGitHub()}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#2c2418] text-white text-sm font-medium hover:bg-[#3d3425] transition-colors"
                                    >
                                        <Github className="w-4 h-4" />
                                        Connect GitHub
                                    </button>
                                )}
                            </>
                        )}
                    </div>

                    {/* Supabase Card */}
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#b69161]/10 p-5">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
                                    <Database className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-[#2c2418]">Supabase</h3>
                                    <p className="text-xs text-[#84745b]">Connect databases to projects</p>
                                </div>
                            </div>
                            {supabaseStatus.loading ? (
                                <Loader2 className="w-4 h-4 animate-spin text-[#b69161]/50" />
                            ) : supabaseStatus.connected ? (
                                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                                    <Check className="w-3 h-3" />
                                    Connected
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 text-xs font-medium text-[#84745b] bg-[#d6cfc9]/30 px-2.5 py-1 rounded-full">
                                    <X className="w-3 h-3" />
                                    Not connected
                                </span>
                            )}
                        </div>

                        {!supabaseStatus.loading && (
                            <>
                                {supabaseStatus.connected && (
                                    <div className="px-3 py-2 bg-[#f5f0eb] rounded-lg mb-3">
                                        <span className="text-xs text-[#84745b]">
                                            {supabaseStatus.details?.projectCount || 0} project{supabaseStatus.details?.projectCount !== 1 ? 's' : ''} connected
                                        </span>
                                    </div>
                                )}
                                {supabaseStatus.error && (
                                    <p className="text-xs text-amber-600 mb-3">{supabaseStatus.error}</p>
                                )}
                                {!supabaseStatus.connected && (
                                    <p className="text-xs text-[#84745b]">
                                        Connect Supabase from the editor panel when working on a project.
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
