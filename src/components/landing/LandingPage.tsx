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
import VantaFogBackground from '@/components/common/VantaFogBackground';

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
    const [authModalMessage, setAuthModalMessage] = useState('Sign in to start building with Automate');
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
            "Ask Automate to create a landing page...",
            "Ask Automate to build a dashboard...",
            "Ask Automate to design a portfolio...",
            "Ask Automate to help with code..."
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
                filter: 'drop-shadow(0 0 20px rgba(182, 145, 97, 0.8)) brightness(1.3)',
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

            // Recent projects (only when signed in and section is rendered)
            if (recentProjectsRef.current) {
                tl.fromTo(recentProjectsRef.current,
                    { y: 30, opacity: 0 },
                    { y: 0, opacity: 1, duration: 0.4 },
                    'start+=0.35'
                );
            }

            // Auth buttons animation - run when auth state is ready (not loading) so refs exist
            if (!authLoading) {
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
    }, [isAuthenticated, authLoading]); // Re-run when auth state is ready so login/signup refs exist

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
            setAuthModalMessage('Sign in to start building with Automate');
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
            {/* Animated Vanta Fog Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <VantaFogBackground />
            </div>

            {/* Header - Logo + Auth Buttons */}
            <header className={`absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-8 py-6 transition-all duration-300 ${showImportModal || showAuthModal ? 'blur-sm pointer-events-none' : ''}`}>
                {/* Logo + Brand */}
                <div className="flex items-center gap-4">
                    <div ref={logoRef} className="relative w-16 h-16 opacity-0">
                        <Image
                            src="/automatelogo.png"
                            alt="Automate Logo"
                            fill
                            className="object-contain"
                        />
                    </div>
                    <span
                        ref={brandRef}
                        className="text-3xl font-bold tracking-tight opacity-0"
                        style={{
                            fontFamily: 'Helvetica, Arial, sans-serif',
                            color: '#2c2418',
                        }}
                    >
                        Automate
                    </span>
                </div>

                {/* Auth Buttons */}
                <div className="flex items-center gap-3">
                    {authLoading ? (
                        <div className="w-8 h-8 rounded-full bg-[#d6cfc9] animate-pulse" />
                    ) : isAuthenticated ? (
                        <>
                            <Link
                                href="/profile"
                                ref={usernameRef as any}
                                className="px-4 py-2 text-sm font-medium text-[#84745b] bg-[#b69161]/10 border border-[#b69161]/20 rounded-full opacity-0 hover:bg-[#b69161]/20 transition-colors"
                            >
                                {user?.user_metadata?.user_name || user?.user_metadata?.preferred_username || user?.email?.split('@')[0]}
                            </Link>
                            <button
                                ref={signoutRef}
                                onClick={() => signOut()}
                                className="px-4 py-2 text-sm font-medium text-[#c45c4a] bg-[#c45c4a]/10 border border-[#c45c4a]/20 hover:bg-[#c45c4a]/20 transition-colors rounded-full opacity-0"
                            >
                                Sign out
                            </button>
                        </>
                    ) : (
                        <>
                            <Link
                                href="/login"
                                ref={loginRef}
                                className="px-6 py-2.5 text-sm font-medium text-[#84745b] bg-[#f2efed]/60 hover:bg-[#f2efed] hover:text-[#2c2418] transition-all rounded-full backdrop-blur-sm border border-[#b69161]/20 shadow-sm hover:shadow-[#b69161]/10"
                            >
                                Log in
                            </Link>
                            <Link
                                href="/signup"
                                ref={signupRef}
                                className="px-6 py-2.5 text-sm font-medium text-white rounded-full transition-all hover:scale-105 bg-[#b69161] hover:bg-[#c9a474] shadow-lg shadow-[#b69161]/20 active:scale-95"
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
                    className="text-5xl md:text-7xl font-bold text-center mb-6 max-w-4xl opacity-0"
                    style={{
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        color: '#2c2418',
                    }}
                >
                    Build something Extraordinary
                </h1>

                {/* Subline */}
                <p
                    ref={sublineRef}
                    className="text-lg md:text-xl text-center mb-16 max-w-xl opacity-0 text-[#4a3f32]"
                >
                    Create apps and websites by chatting with AI
                </p>

                <div ref={inputRef} className="w-full max-w-3xl flex flex-col items-center opacity-0">
                    <form onSubmit={handleSubmit} className="w-full relative z-50 rounded-3xl">
                        <div
                            className="relative rounded-3xl backdrop-blur-xl border border-[#b69161]/30"
                            style={{
                                background: 'linear-gradient(135deg, rgba(230, 224, 221, 0.6) 0%, rgba(242, 239, 237, 0.5) 50%, rgba(230, 224, 221, 0.55) 100%)',
                                boxShadow: '0 20px 60px rgba(132, 116, 91, 0.15), 0 8px 32px rgba(132, 116, 91, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
                            }}
                        >


                            {/* Input Field */}
                            <input
                                type="text"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={placeholderText}
                                className="w-full pl-8 pr-32 pt-6 pb-24 text-base text-[#2c2418] placeholder-[#7a6f60] bg-transparent outline-none rounded-3xl"
                                style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                                disabled={isLoading || isSubmitting}
                            />

                            {/* Action Buttons (Right) */}
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                <button
                                    type="button"
                                    className="p-2.5 text-[#2c2418] hover:text-[#2c2418] transition-colors rounded-full hover:bg-[#b69161]/15"
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
                                            ? "bg-[#b69161] hover:bg-[#c9a474] shadow-lg shadow-[#b69161]/40"
                                            : "bg-[#a89d8e]"
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
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border border-[#b69161]/40 backdrop-blur-md",
                                        executorMode === 'mastra'
                                            ? "bg-[#e6e0dd]/60 text-[#2c2418]"
                                            : "bg-[#e6e0dd]/60 text-[#2c2418]"
                                    )}
                                >
                                    {executorMode === 'mastra' ? (
                                        <>
                                            <Image src="/automatelogo.png" alt="Automate" width={14} height={14} className="object-contain" />
                                            <span>Automate Editor</span>
                                        </>
                                    ) : (
                                        <>
                                            <ClaudeLogo className="w-3.5 h-3.5 text-[#2c2418]" />
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
                                        className="absolute bottom-full left-0 mb-2 w-48 rounded-xl shadow-xl border border-[#b69161]/30 overflow-hidden backdrop-blur-xl"
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(242, 239, 237, 0.92) 0%, rgba(230, 224, 221, 0.88) 100%)',
                                            boxShadow: '0 8px 32px rgba(132, 116, 91, 0.2)',
                                        }}
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
                                                    ? "bg-[#b69161]/15"
                                                    : "hover:bg-[#b69161]/10"
                                            )}
                                        >
                                            <ClaudeLogo className="w-4 h-4 text-[#2c2418]" />
                                            <div className="flex-1">
                                                <div className="text-sm font-medium text-[#2c2418]">Claude Code</div>
                                                <div className="text-xs text-[#7a6f60]">Anthropic Claude</div>
                                            </div>
                                            {executorMode !== 'mastra' && (
                                                <Check className="w-4 h-4 text-[#2c2418]" />
                                            )}
                                        </button>

                                        {/* Automate Editor Option */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onModeChange?.('mastra');
                                                setIsModeDropdownOpen(false);
                                            }}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                                                executorMode === 'mastra'
                                                    ? "bg-[#b69161]/15"
                                                    : "hover:bg-[#b69161]/10"
                                            )}
                                        >
                                            <Image src="/automatelogo.png" alt="Automate" width={16} height={16} className="object-contain" />
                                            <div className="flex-1">
                                                <div className="text-sm font-medium text-[#2c2418]">Automate Editor</div>
                                                <div className="text-xs text-[#7a6f60]">Mastra Agent (GPT-4o)</div>
                                            </div>
                                            {executorMode === 'mastra' && (
                                                <Check className="w-4 h-4 text-[#2c2418]" />
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
                                className="absolute right-5 bottom-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#2c2418] hover:text-[#2c2418] hover:bg-[#b69161]/15 transition-all opacity-0"
                            >
                                <Github className="w-3.5 h-3.5" />
                                <span>Import</span>
                            </button>
                        </div>
                    </form>





                    {/* Recent Projects - only when signed in; show only current user's projects */}
                    {isAuthenticated && user?.id && onOpenPreview && (
                        <div ref={recentProjectsRef} className="opacity-0">
                            <RecentProjectsTable userId={user.id} onOpen={onOpenPreview} limit={5} showPagination={false} />
                        </div>
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
