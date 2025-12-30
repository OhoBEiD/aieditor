'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Send, Sparkles, Paperclip, Github } from 'lucide-react';
import { gsap } from 'gsap';
import { RecentProjectsCard } from './RecentProjectsCard';
import { useAuth } from '@/contexts/AuthContext';
import { AuthRequiredModal } from '@/components/auth/AuthRequiredModal';
import { RepoSelectorModal } from '@/components/auth/RepoSelectorModal';

interface LandingPageProps {
    onSendMessage: (message: string) => void;
    onCreateProject?: (message: string) => Promise<void>;
    onImportRepo?: (repoUrl: string) => Promise<void>;
    onOpenPreview?: (project?: any) => void;
    isLoading?: boolean;
}

export function LandingPage({ onSendMessage, onCreateProject, onImportRepo, onOpenPreview, isLoading }: LandingPageProps) {
    const [message, setMessage] = useState('');
    const [showImportModal, setShowImportModal] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authModalMessage, setAuthModalMessage] = useState('Sign in to start building with AutoMate');

    const { isAuthenticated, isLoading: authLoading, signOut, user } = useAuth();

    // Refs for animations
    const containerRef = useRef<HTMLDivElement>(null);
    const logoRef = useRef<HTMLDivElement>(null);
    const brandRef = useRef<HTMLSpanElement>(null);
    const loginRef = useRef<HTMLAnchorElement>(null);
    const signupRef = useRef<HTMLAnchorElement>(null);
    const headlineRef = useRef<HTMLHeadingElement>(null);
    const sublineRef = useRef<HTMLParagraphElement>(null);
    const inputRef = useRef<HTMLDivElement>(null);

    const usernameRef = useRef<HTMLSpanElement>(null);
    const signoutRef = useRef<HTMLButtonElement>(null);

    // GSAP animations
    useEffect(() => {
        const ctx = gsap.context(() => {
            const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

            // Initial load animations (Logo, Brand, Headline)
            // Only run these once on mount
            if (!containerRef.current?.dataset.animated) {
                // Logo reveal with shine effect
                tl.fromTo(logoRef.current,
                    {
                        scale: 0.8,
                        opacity: 0,
                        rotation: -10
                    },
                    {
                        scale: 1,
                        opacity: 1,
                        rotation: 0,
                        duration: 1,
                        ease: 'back.out(1.7)'
                    }
                )
                    // Shine effect on logo
                    .to(logoRef.current, {
                        filter: 'drop-shadow(0 0 15px rgba(56, 189, 248, 0.6)) brightness(1.2)',
                        duration: 0.5,
                        yoyo: true,
                        repeat: 1,
                        ease: "power2.inOut"
                    }, '-=0.3')
                    // Brand name reveal
                    .fromTo(brandRef.current,
                        { x: -30, opacity: 0 },
                        { x: 0, opacity: 1, duration: 0.6 },
                        '-=0.5'
                    )
                    // Headline with split reveal
                    .fromTo(headlineRef.current,
                        { y: 40, opacity: 0 },
                        { y: 0, opacity: 1, duration: 0.8 },
                        '-=0.3'
                    )
                    // Subline
                    .fromTo(sublineRef.current,
                        { y: 30, opacity: 0 },
                        { y: 0, opacity: 1, duration: 0.7 },
                        '-=0.5'
                    )
                    // Input box
                    .fromTo(inputRef.current,
                        { y: 40, opacity: 0, scale: 0.95 },
                        { y: 0, opacity: 1, scale: 1, duration: 0.8 },
                        '-=0.4'
                    );

                if (containerRef.current) {
                    containerRef.current.dataset.animated = 'true';
                }
            }

            // Auth buttons animation - Independent timeline for just these elements
            const authTl = gsap.timeline({ defaults: { ease: 'power3.out' } });

            if (isAuthenticated) {
                if (usernameRef.current && signoutRef.current) {
                    authTl.fromTo([usernameRef.current, signoutRef.current],
                        { y: -20, opacity: 0 },
                        { y: 0, opacity: 1, duration: 0.5, stagger: 0.1 }
                    );
                }
            } else {
                if (loginRef.current && signupRef.current) {
                    authTl.fromTo([loginRef.current, signupRef.current],
                        { y: -20, opacity: 0 },
                        { y: 0, opacity: 1, duration: 0.5, stagger: 0.1 }
                    );
                }
            }

        }, containerRef);

        return () => ctx.revert();
    }, [isAuthenticated]); // Re-run when auth state changes

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (message.trim() && !isLoading) {
            // Check if user is authenticated
            if (!isAuthenticated) {
                setShowAuthModal(true);
                return;
            }
            // If onCreateProject is provided, create a new project
            if (onCreateProject) {
                await onCreateProject(message.trim());
            } else {
                onSendMessage(message.trim());
            }
            setMessage('');
        }
    };

    const handleImportClick = () => {
        if (!isAuthenticated) {
            setAuthModalMessage('Sign in to start building with AutoMate');
            setShowAuthModal(true);
            return;
        }

        // Check if user has GitHub connected
        const hasGitHub = user?.user_metadata?.user_name || user?.app_metadata?.provider === 'github';
        if (!hasGitHub) {
            // User is authenticated but no GitHub linked
            setAuthModalMessage('Connect your GitHub account to import repositories');
            setShowAuthModal(true);
            return;
        }

        setShowImportModal(true);
    };

    interface RepoData {
        url: string;
    }

    const handleRepoSelect = async (repo: RepoData) => {
        if (onImportRepo) {
            try {
                await onImportRepo(repo.url);
                setShowImportModal(false);
            } catch (error) {
                console.error('Import failed:', error);
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <div
            ref={containerRef}
            className="relative h-screen w-full overflow-y-auto overflow-x-hidden"
            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
            {/* Animated SVG Background - Lovable style */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 1920 1080"
                    className="w-full h-full"
                    preserveAspectRatio="xMidYMid slice"
                >
                    <defs>
                        {/* Animated gradients - more vibrant colors */}
                        <radialGradient id="blob1" cx="50%" cy="50%">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.9">
                                <animate attributeName="stop-color" values="#6366f1;#8b5cf6;#ec4899;#6366f1" dur="8s" repeatCount="indefinite" />
                            </stop>
                            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0">
                                <animate attributeName="stop-color" values="#8b5cf6;#ec4899;#6366f1;#8b5cf6" dur="8s" repeatCount="indefinite" />
                            </stop>
                        </radialGradient>

                        <radialGradient id="blob2" cx="50%" cy="50%">
                            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.9">
                                <animate attributeName="stop-color" values="#06b6d4;#14b8a6;#10b981;#06b6d4" dur="10s" repeatCount="indefinite" />
                            </stop>
                            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0">
                                <animate attributeName="stop-color" values="#14b8a6;#10b981;#06b6d4;#14b8a6" dur="10s" repeatCount="indefinite" />
                            </stop>
                        </radialGradient>

                        <radialGradient id="blob3" cx="50%" cy="50%">
                            <stop offset="0%" stopColor="#f97316" stopOpacity="0.9">
                                <animate attributeName="stop-color" values="#f97316;#facc15;#eab308;#f97316" dur="12s" repeatCount="indefinite" />
                            </stop>
                            <stop offset="100%" stopColor="#facc15" stopOpacity="0">
                                <animate attributeName="stop-color" values="#facc15;#eab308;#f97316;#facc15" dur="12s" repeatCount="indefinite" />
                            </stop>
                        </radialGradient>

                        <radialGradient id="blob4" cx="50%" cy="50%">
                            <stop offset="0%" stopColor="#ec4899" stopOpacity="0.9">
                                <animate attributeName="stop-color" values="#ec4899;#f43f5e;#a855f7;#ec4899" dur="9s" repeatCount="indefinite" />
                            </stop>
                            <stop offset="100%" stopColor="#f43f5e" stopOpacity="0">
                                <animate attributeName="stop-color" values="#f43f5e;#a855f7;#ec4899;#f43f5e" dur="9s" repeatCount="indefinite" />
                            </stop>
                        </radialGradient>

                        <radialGradient id="blob5" cx="50%" cy="50%">
                            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.9">
                                <animate attributeName="stop-color" values="#0ea5e9;#3b82f6;#6366f1;#0ea5e9" dur="11s" repeatCount="indefinite" />
                            </stop>
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0">
                                <animate attributeName="stop-color" values="#3b82f6;#6366f1;#0ea5e9;#3b82f6" dur="11s" repeatCount="indefinite" />
                            </stop>
                        </radialGradient>

                        <filter id="blur">
                            <feGaussianBlur stdDeviation="100" />
                        </filter>
                    </defs>

                    {/* Base background */}
                    <rect width="100%" height="100%" fill="#ffffff" />

                    {/* Animated blobs - faster movement */}
                    <g filter="url(#blur)">
                        <ellipse cx="20%" cy="35%" rx="450" ry="380" fill="url(#blob1)">
                            <animate attributeName="cx" values="20%;35%;15%;20%" dur="15s" repeatCount="indefinite" />
                            <animate attributeName="cy" values="35%;50%;30%;35%" dur="12s" repeatCount="indefinite" />
                            <animate attributeName="rx" values="450;480;450" dur="10s" repeatCount="indefinite" />
                        </ellipse>

                        <ellipse cx="80%" cy="55%" rx="500" ry="450" fill="url(#blob2)">
                            <animate attributeName="cx" values="80%;65%;85%;80%" dur="18s" repeatCount="indefinite" />
                            <animate attributeName="cy" values="55%;70%;50%;55%" dur="14s" repeatCount="indefinite" />
                            <animate attributeName="rx" values="500;530;500" dur="11s" repeatCount="indefinite" />
                        </ellipse>

                        <ellipse cx="50%" cy="85%" rx="550" ry="400" fill="url(#blob3)">
                            <animate attributeName="cx" values="50%;60%;40%;50%" dur="16s" repeatCount="indefinite" />
                            <animate attributeName="cy" values="85%;75%;90%;85%" dur="13s" repeatCount="indefinite" />
                            <animate attributeName="ry" values="400;450;400" dur="9s" repeatCount="indefinite" />
                        </ellipse>

                        <ellipse cx="65%" cy="25%" rx="420" ry="360" fill="url(#blob4)">
                            <animate attributeName="cx" values="65%;75%;55%;65%" dur="14s" repeatCount="indefinite" />
                            <animate attributeName="cy" values="25%;35%;20%;25%" dur="11s" repeatCount="indefinite" />
                            <animate attributeName="rx" values="420;460;420" dur="8s" repeatCount="indefinite" />
                        </ellipse>

                        <ellipse cx="35%" cy="70%" rx="480" ry="420" fill="url(#blob5)">
                            <animate attributeName="cx" values="35%;25%;45%;35%" dur="17s" repeatCount="indefinite" />
                            <animate attributeName="cy" values="70%;60%;80%;70%" dur="15s" repeatCount="indefinite" />
                            <animate attributeName="ry" values="420;470;420" dur="10s" repeatCount="indefinite" />
                        </ellipse>
                    </g>
                </svg>
            </div>

            {/* Header - Logo + Auth Buttons */}
            <header className={`absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-8 py-6 transition-all duration-300 ${showImportModal || showAuthModal ? 'blur-sm pointer-events-none' : ''}`}>
                {/* Logo + Brand */}
                <div className="flex items-center gap-4">
                    <div ref={logoRef} className="relative w-16 h-16">
                        <Image
                            src="/automatelogo.png"
                            alt="AutoMate Logo"
                            fill
                            className="object-contain"
                        />
                    </div>
                    <span
                        ref={brandRef}
                        className="text-3xl font-bold text-gray-900 tracking-tight"
                        style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}
                    >
                        AutoMate
                    </span>
                </div>

                {/* Auth Buttons */}
                <div className="flex items-center gap-3">
                    {authLoading ? (
                        <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
                    ) : isAuthenticated ? (
                        <>
                            <span
                                ref={usernameRef}
                                className="px-4 py-2 text-sm font-medium text-purple-700 bg-purple-100 rounded-full"
                            >
                                {user?.user_metadata?.user_name || user?.user_metadata?.preferred_username || user?.email?.split('@')[0]}
                            </span>
                            <button
                                ref={signoutRef}
                                onClick={() => signOut()}
                                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-100/60 hover:bg-red-200/80 transition-colors rounded-full"
                            >
                                Sign out
                            </button>
                        </>
                    ) : (
                        <>
                            <Link
                                href="/login"
                                ref={loginRef}
                                className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white/40 hover:bg-white/80 hover:text-gray-900 transition-all rounded-full backdrop-blur-sm border border-white/20 shadow-sm hover:shadow-md"
                            >
                                Log in
                            </Link>
                            <Link
                                href="/signup"
                                ref={signupRef}
                                className="px-6 py-2.5 text-sm font-medium text-white rounded-full transition-all hover:scale-105 hover:shadow-lg hover:shadow-blue-500/25 active:scale-95"
                                style={{
                                    background: 'linear-gradient(135deg, #1C54AF 0%, #1E85B3 50%, #3FDDDB 100%)',
                                }}
                            >
                                Sign up
                            </Link>
                        </>
                    )}
                </div>
            </header>

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center justify-center min-h-full w-full px-4 py-24">
                {/* Headline */}
                <h1
                    ref={headlineRef}
                    className="text-5xl md:text-7xl font-bold text-gray-900 text-center mb-6 max-w-4xl"
                    style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                >
                    Build something Extraordinary
                </h1>

                {/* Subline */}
                <p
                    ref={sublineRef}
                    className="text-lg md:text-xl text-gray-600 text-center mb-16 max-w-xl"
                >
                    Create apps and websites by chatting with AI
                </p>

                {/* Input Container */}
                <div ref={inputRef} className="w-full max-w-3xl flex flex-col items-center">
                    <form onSubmit={handleSubmit} className="w-full relative z-20">
                        <div
                            className="relative rounded-3xl overflow-hidden bg-white shadow-2xl"
                            style={{
                                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
                            }}
                        >
                            {/* Attach Button */}
                            <div className="absolute left-5 top-1/2 -translate-y-1/2">
                                <button
                                    type="button"
                                    className="p-2.5 text-gray-500 hover:text-gray-700 transition-colors rounded-lg hover:bg-gray-100"
                                    onClick={() => {/* Handle attach */ }}
                                >
                                    <Paperclip className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Input Field */}
                            <input
                                type="text"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask AutoMate to create a landing..."
                                className="w-full pl-16 pr-20 py-6 text-base text-gray-900 placeholder-gray-400 bg-transparent outline-none"
                                style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                                disabled={isLoading}
                            />

                            {/* Send Button */}
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                <button
                                    type="submit"
                                    disabled={!message.trim() || isLoading}
                                    className="p-3.5 rounded-full text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                                    style={{
                                        background: message.trim()
                                            ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                                            : 'rgba(156, 163, 175, 0.3)',
                                        boxShadow: message.trim() ? '0 4px 15px rgba(102, 126, 234, 0.4)' : 'none',
                                    }}
                                >
                                    {isLoading ? (
                                        <Sparkles className="w-5 h-5 animate-pulse" />
                                    ) : (
                                        <Send className="w-5 h-5" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </form>

                    {/* Import GitHub Repo Button */}
                    <button
                        type="button"
                        onClick={handleImportClick}
                        className="mt-6 flex items-center gap-2 px-6 py-3 text-sm font-medium text-gray-700 bg-white/60 hover:bg-white/90 transition-all rounded-full backdrop-blur-sm border border-white/30 shadow-sm hover:shadow-md"
                    >
                        <Github className="w-5 h-5" />
                        Import GitHub Repo
                    </button>

                    {/* Recent Projects */}
                    {onOpenPreview && (
                        <RecentProjectsCard onOpen={onOpenPreview} />
                    )}
                </div>

                {/* Repo Selector Modal */}
                <RepoSelectorModal
                    isOpen={showImportModal}
                    onClose={() => setShowImportModal(false)}
                    onSelectRepo={handleRepoSelect}
                />

                {/* Auth Required Modal */}
                <AuthRequiredModal
                    isOpen={showAuthModal}
                    onClose={() => setShowAuthModal(false)}
                    message={authModalMessage}
                />
            </div>
        </div>
    );
}
