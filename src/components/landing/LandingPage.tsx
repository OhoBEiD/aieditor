'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Send, Loader2, Paperclip, Github, ChevronDown, Check } from 'lucide-react';
import { gsap } from 'gsap';
import { ClaudeLogo } from '@/components/icons/ClaudeLogo';
import { RecentProjectsTable } from './RecentProjectsTable';
import { useAuth } from '@/contexts/AuthContext';
import { AuthRequiredModal } from '@/components/auth/AuthRequiredModal';
import { RepoSelectorModal } from '@/components/auth/RepoSelectorModal';
import type { ExecutorMode } from '@/components/chat/MessageInput';
import { cn } from '@/lib/utils';

interface LandingPageProps {
    onSendMessage: (message: string) => void;
    onCreateProject?: (message: string) => Promise<void>;
    onImportRepo?: (repoUrl: string) => Promise<void>;
    onOpenPreview?: (project?: any) => void;
    isLoading?: boolean;
    executorMode?: ExecutorMode;
    onModeChange?: (mode: ExecutorMode) => void;
}

export function LandingPage({ onSendMessage, onCreateProject, onImportRepo, onOpenPreview, isLoading, executorMode = 'mastra', onModeChange }: LandingPageProps) {
    const [message, setMessage] = useState('');
    const [showImportModal, setShowImportModal] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authModalMessage, setAuthModalMessage] = useState('Sign in to start building with AutoMate');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const dropdownMenuRef = useRef<HTMLDivElement>(null);
    const modeBtnRef = useRef<HTMLButtonElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsModeDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // GSAP animation for dropdown
    useEffect(() => {
        if (!dropdownMenuRef.current) return;

        if (isModeDropdownOpen) {
            // Opening animation
            gsap.fromTo(dropdownMenuRef.current,
                {
                    opacity: 0,
                    y: -10,
                    scale: 0.95,
                },
                {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    duration: 0.25,
                    ease: 'back.out(1.7)',
                }
            );

            // Animate dropdown items with stagger
            const items = dropdownMenuRef.current.querySelectorAll('button');
            gsap.fromTo(items,
                {
                    opacity: 0,
                    x: -10,
                },
                {
                    opacity: 1,
                    x: 0,
                    duration: 0.2,
                    stagger: 0.05,
                    ease: 'power2.out',
                    delay: 0.1,
                }
            );
        } else {
            // Closing animation
            gsap.to(dropdownMenuRef.current, {
                opacity: 0,
                y: -10,
                scale: 0.95,
                duration: 0.15,
                ease: 'power2.in',
            });
        }
    }, [isModeDropdownOpen]);

    // GSAP hover animation for mode button
    useEffect(() => {
        if (!modeBtnRef.current) return;

        const btn = modeBtnRef.current;

        const handleMouseEnter = () => {
            gsap.to(btn, {
                scale: 1.05,
                y: -2,
                duration: 0.2,
                ease: 'power2.out',
            });
        };

        const handleMouseLeave = () => {
            gsap.to(btn, {
                scale: 1,
                y: 0,
                duration: 0.2,
                ease: 'power2.out',
            });
        };

        btn.addEventListener('mouseenter', handleMouseEnter);
        btn.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            btn.removeEventListener('mouseenter', handleMouseEnter);
            btn.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, []);

    // Typing animation for placeholder
    const [placeholderText, setPlaceholderText] = useState('');
    const [typingPhase, setTypingPhase] = useState<'typing' | 'pausing' | 'deleting'>('typing');
    const [phraseIndex, setPhraseIndex] = useState(0);

    useEffect(() => {
        const phrases = [
            "Ask AutoMate to create a landing page...",
            "Ask AutoMate to build a dashboard...",
            "Ask AutoMate to design a portfolio...",
            "Ask AutoMate to help with code..."
        ];
        const currentPhrase = phrases[phraseIndex];

        let timeout: NodeJS.Timeout;

        if (typingPhase === 'typing') {
            if (placeholderText.length < currentPhrase.length) {
                timeout = setTimeout(() => {
                    setPlaceholderText(currentPhrase.slice(0, placeholderText.length + 1));
                }, 20 + Math.random() * 30); // Faster typing
            } else {
                setTypingPhase('pausing');
            }
        } else if (typingPhase === 'pausing') {
            timeout = setTimeout(() => {
                setTypingPhase('deleting');
            }, 1000); // Shorter pause
        } else if (typingPhase === 'deleting') {
            if (placeholderText.length > 0) {
                timeout = setTimeout(() => {
                    setPlaceholderText(currentPhrase.slice(0, placeholderText.length - 1));
                }, 10); // Faster deleting
            } else {
                setTypingPhase('typing');
                setPhraseIndex((prev) => (prev + 1) % phrases.length);
            }
        }

        return () => clearTimeout(timeout);
    }, [placeholderText, typingPhase, phraseIndex]);

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
    const importBtnRef = useRef<HTMLButtonElement>(null);
    const recentProjectsRef = useRef<HTMLDivElement>(null);

    const usernameRef = useRef<HTMLSpanElement>(null);
    const signoutRef = useRef<HTMLButtonElement>(null);

    // GSAP animations
    useEffect(() => {
        const ctx = gsap.context(() => {
            const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, delay: 0.1 });

            // Start all animations relative to a common label
            tl.add('start');

            // Logo reveal
            tl.fromTo(logoRef.current,
                { scale: 0.5, opacity: 0, rotation: -180, y: -50 },
                { scale: 1, opacity: 1, rotation: 0, y: 0, duration: 0.6, ease: 'back.out(2)' },
                'start'
            );

            // Separate floating animation to avoid blocking the timeline
            gsap.to(logoRef.current, {
                y: -10,
                duration: 2,
                yoyo: true,
                repeat: -1,
                ease: "sine.inOut",
                delay: 0.7 // Start after reveal
            });

            // Shine effect on logo
            tl.to(logoRef.current, {
                filter: 'drop-shadow(0 0 20px rgba(139, 92, 246, 0.8)) brightness(1.3)',
                duration: 0.4,
                yoyo: true,
                repeat: 1,
                ease: "power2.inOut"
            }, 'start+=0.4');

            // Brand name - appearing quickly after logo
            tl.fromTo(brandRef.current,
                { x: -50, opacity: 0, scale: 0.8 },
                { x: 0, opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(1.5)' },
                'start+=0.1'
            );

            // Headline
            tl.fromTo(headlineRef.current,
                { y: 60, opacity: 0, scale: 0.9 },
                { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.3)' },
                'start+=0.15'
            );

            // Subline
            tl.fromTo(sublineRef.current,
                { y: 40, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.4 },
                'start+=0.2'
            );

            // Input box
            tl.fromTo(inputRef.current,
                { y: 50, opacity: 0, scale: 0.9 },
                { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.2)' },
                'start+=0.25'
            );

            // Import button
            tl.fromTo(importBtnRef.current,
                { y: 30, opacity: 0, scale: 0.95 },
                { y: 0, opacity: 1, scale: 1, duration: 0.3 },
                'start+=0.3'
            );

            // Recent projects
            tl.fromTo(recentProjectsRef.current,
                { y: 30, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.4 },
                'start+=0.35'
            );

            // Auth buttons animation - Independent timeline
            const authTl = gsap.timeline({ defaults: { ease: 'power3.out' }, delay: 0.3 });

            if (isAuthenticated) {
                if (usernameRef.current && signoutRef.current) {
                    authTl.fromTo([usernameRef.current, signoutRef.current],
                        { y: -20, opacity: 0, scale: 0.9 },
                        { y: 0, opacity: 1, scale: 1, duration: 0.3, stagger: 0.05, ease: 'back.out(1.5)' }
                    );
                }
            } else {
                if (loginRef.current && signupRef.current) {
                    authTl.fromTo([loginRef.current, signupRef.current],
                        { y: -20, opacity: 0, scale: 0.9 },
                        { y: 0, opacity: 1, scale: 1, duration: 0.3, stagger: 0.05, ease: 'back.out(1.5)' }
                    );
                }
            }

            // Add hover animations for interactive elements
            if (loginRef.current) {
                loginRef.current.addEventListener('mouseenter', () => {
                    gsap.to(loginRef.current, {
                        scale: 1.05,
                        duration: 0.3,
                        ease: 'power2.out'
                    });
                });
                loginRef.current.addEventListener('mouseleave', () => {
                    gsap.to(loginRef.current, {
                        scale: 1,
                        duration: 0.3,
                        ease: 'power2.out'
                    });
                });
            }

            if (signupRef.current) {
                signupRef.current.addEventListener('mouseenter', () => {
                    gsap.to(signupRef.current, {
                        scale: 1.08,
                        y: -2,
                        duration: 0.3,
                        ease: 'power2.out'
                    });
                });
                signupRef.current.addEventListener('mouseleave', () => {
                    gsap.to(signupRef.current, {
                        scale: 1,
                        y: 0,
                        duration: 0.3,
                        ease: 'power2.out'
                    });
                });
            }

            if (importBtnRef.current) {
                importBtnRef.current.addEventListener('mouseenter', () => {
                    gsap.to(importBtnRef.current, {
                        scale: 1.05,
                        y: -2,
                        duration: 0.3,
                        ease: 'power2.out'
                    });
                });
                importBtnRef.current.addEventListener('mouseleave', () => {
                    gsap.to(importBtnRef.current, {
                        scale: 1,
                        y: 0,
                        duration: 0.3,
                        ease: 'power2.out'
                    });
                });
            }

        }, containerRef);

        return () => ctx.revert();
    }, [isAuthenticated]); // Re-run when auth state changes

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (message.trim() && !isLoading && !isSubmitting) {
            // Check if user is authenticated
            if (!isAuthenticated) {
                setShowAuthModal(true);
                return;
            }

            setIsSubmitting(true);
            try {
                // If onCreateProject is provided, create a new project
                if (onCreateProject) {
                    await onCreateProject(message.trim());
                } else {
                    onSendMessage(message.trim());
                }
                setMessage('');
            } finally {
                setIsSubmitting(false);
            }
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
            className="relative h-screen w-full overflow-hidden"
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
                    <div ref={logoRef} className="relative w-16 h-16 opacity-0">
                        <Image
                            src="/automatelogo.png"
                            alt="AutoMate Logo"
                            fill
                            className="object-contain"
                        />
                    </div>
                    <span
                        ref={brandRef}
                        className="text-3xl font-bold text-gray-900 tracking-tight opacity-0"
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
                                className="px-4 py-2 text-sm font-medium text-purple-700 bg-purple-100 rounded-full opacity-0"
                            >
                                {user?.user_metadata?.user_name || user?.user_metadata?.preferred_username || user?.email?.split('@')[0]}
                            </span>
                            <button
                                ref={signoutRef}
                                onClick={() => signOut()}
                                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-100/60 hover:bg-red-200/80 transition-colors rounded-full opacity-0"
                            >
                                Sign out
                            </button>
                        </>
                    ) : (
                        <>
                            <Link
                                href="/login"
                                ref={loginRef}
                                className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white/40 hover:bg-white/80 hover:text-gray-900 transition-all rounded-full backdrop-blur-sm border border-white/20 shadow-sm hover:shadow-md opacity-0"
                            >
                                Log in
                            </Link>
                            <Link
                                href="/signup"
                                ref={signupRef}
                                className="px-6 py-2.5 text-sm font-medium text-white rounded-full transition-all hover:scale-105 bg-purple-500 hover:bg-purple-600 shadow-lg shadow-purple-500/20 active:scale-95 opacity-0"
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
                    className="text-5xl md:text-7xl font-bold text-gray-900 text-center mb-6 max-w-4xl opacity-0"
                    style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                >
                    Build something Extraordinary
                </h1>

                {/* Subline */}
                <p
                    ref={sublineRef}
                    className="text-lg md:text-xl text-gray-600 text-center mb-16 max-w-xl opacity-0"
                >
                    Create apps and websites by chatting with AI
                </p>

                <div ref={inputRef} className="w-full max-w-3xl flex flex-col items-center opacity-0">
                    <form onSubmit={handleSubmit} className="w-full relative z-50 rounded-3xl">
                        <div
                            className="relative rounded-3xl bg-white shadow-2xl"
                            style={{
                                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
                            }}
                        >


                            {/* Input Field */}
                            <input
                                type="text"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={placeholderText}
                                className="w-full pl-8 pr-32 pt-6 pb-24 text-base text-gray-900 placeholder-gray-400 bg-transparent outline-none rounded-3xl"
                                style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                                disabled={isLoading || isSubmitting}
                            />

                            {/* Action Buttons (Right) */}
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                <button
                                    type="button"
                                    className="p-2.5 text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100/50"
                                    onClick={() => {/* Handle attach */ }}
                                >
                                    <Paperclip className="w-5 h-5" />
                                </button>

                                <button
                                    type="submit"
                                    disabled={!message.trim() || isLoading || isSubmitting}
                                    className={cn(
                                        "p-3.5 rounded-full text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105",
                                        message.trim()
                                            ? "bg-purple-500 hover:bg-purple-600 shadow-lg shadow-purple-500/20"
                                            : "bg-gray-300"
                                    )}
                                >
                                    {isLoading || isSubmitting ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <Send className="w-5 h-5" />
                                    )}
                                </button>
                            </div>

                            {/* Mode Selector Dropdown */}
                            <div className="absolute left-5 bottom-4 z-30" ref={dropdownRef}>
                                <button
                                    ref={modeBtnRef}
                                    type="button"
                                    onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                                        executorMode === 'mastra'
                                            ? "bg-orange-50 text-orange-900 border-orange-100"
                                            : "bg-purple-50 text-purple-900 border-purple-100"
                                    )}
                                >
                                    {executorMode === 'mastra' ? (
                                        <>
                                            <Image src="/automatelogo.png" alt="AutoMate" width={14} height={14} className="object-contain" />
                                            <span>AutoMate Editor</span>
                                        </>
                                    ) : (
                                        <>
                                            <ClaudeLogo className="w-3.5 h-3.5 text-purple-600" />
                                            <span>Claude Code</span>
                                        </>
                                    )}
                                    <ChevronDown className={cn(
                                        "w-3 h-3 transition-transform",
                                        isModeDropdownOpen && "rotate-180"
                                    )} />
                                </button>

                                {/* Dropdown Menu */}
                                {isModeDropdownOpen && (
                                    <div
                                        ref={dropdownMenuRef}
                                        className="absolute bottom-full left-0 mb-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden"
                                    >
                                        {/* Claude Code Option */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onModeChange?.('thinking');
                                                setIsModeDropdownOpen(false);
                                            }}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                                                executorMode !== 'mastra'
                                                    ? "bg-purple-50"
                                                    : "hover:bg-gray-50"
                                            )}
                                        >
                                            <ClaudeLogo className="w-4 h-4 text-purple-600" />
                                            <div className="flex-1">
                                                <div className="text-sm font-medium text-gray-900">Claude Code</div>
                                                <div className="text-xs text-gray-500">Anthropic Claude</div>
                                            </div>
                                            {executorMode !== 'mastra' && (
                                                <Check className="w-4 h-4 text-purple-600" />
                                            )}
                                        </button>

                                        {/* AutoMate Editor Option */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onModeChange?.('mastra');
                                                setIsModeDropdownOpen(false);
                                            }}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                                                executorMode === 'mastra'
                                                    ? "bg-orange-50"
                                                    : "hover:bg-gray-50"
                                            )}
                                        >
                                            <Image src="/automatelogo.png" alt="AutoMate" width={16} height={16} className="object-contain" />
                                            <div className="flex-1">
                                                <div className="text-sm font-medium text-gray-900">AutoMate Editor</div>
                                                <div className="text-xs text-gray-500">Mastra Agent (GPT-4o)</div>
                                            </div>
                                            {executorMode === 'mastra' && (
                                                <Check className="w-4 h-4 text-orange-600" />
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Import GitHub Button (Bottom Right) */}
                            <button
                                ref={importBtnRef}
                                type="button"
                                onClick={handleImportClick}
                                className="absolute right-5 bottom-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100/50 transition-all opacity-0"
                            >
                                <Github className="w-3.5 h-3.5" />
                                <span>Import</span>
                            </button>
                        </div>
                    </form>





                    {/* Recent Projects */}
                    <div ref={recentProjectsRef} className="opacity-0">
                        {onOpenPreview && (
                            <RecentProjectsTable onOpen={onOpenPreview} limit={5} showPagination={false} />
                        )}
                    </div>
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
