'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Lock, Github, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { gsap } from 'gsap';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const { signIn, signInWithGitHub, isAuthenticated, isLoading: authLoading } = useAuth();
    const router = useRouter();

    const containerRef = useRef<HTMLDivElement>(null);
    const formRef = useRef<HTMLDivElement>(null);

    // Redirect if already authenticated
    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            router.push('/');
        }
    }, [isAuthenticated, authLoading, router]);

    // GSAP animations
    useEffect(() => {
        const ctx = gsap.context(() => {
            gsap.fromTo(formRef.current,
                { y: 40, opacity: 0, scale: 0.95 },
                { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: 'power3.out' }
            );
        }, containerRef);

        return () => ctx.revert();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const { error } = await signIn(email, password);
            if (error) {
                setError(error.message);
            } else {
                router.push('/');
            }
        } catch {
            setError('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGitHubLogin = async () => {
        await signInWithGitHub();
    };

    if (authLoading) {
        return (
            <div className="min-h-screen overflow-hidden relative flex items-center justify-center">
                {/* SVG Background */}
                <svg
                    className="absolute inset-0 w-full h-full z-0"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 1920 1080"
                    preserveAspectRatio="xMidYMid slice"
                >
                    <defs>
                        <filter id="blur-loader" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur in="SourceGraphic" stdDeviation="80" />
                        </filter>
                        <radialGradient id="blob1-loader" cx="50%" cy="50%">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.9" />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                        </radialGradient>
                        <radialGradient id="blob2-loader" cx="50%" cy="50%">
                            <stop offset="0%" stopColor="#ec4899" stopOpacity="0.8" />
                            <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
                        </radialGradient>
                    </defs>
                    <rect width="100%" height="100%" fill="#faf9fb" />
                    <g filter="url(#blur-loader)">
                        <ellipse cx="400" cy="400" rx="500" ry="400" fill="url(#blob1-loader)">
                            <animate attributeName="cx" values="400;500;400" dur="20s" repeatCount="indefinite" />
                        </ellipse>
                        <ellipse cx="1500" cy="600" rx="450" ry="350" fill="url(#blob2-loader)">
                            <animate attributeName="cx" values="1500;1400;1500" dur="22s" repeatCount="indefinite" />
                        </ellipse>
                    </g>
                </svg>

                <div className="relative z-10 flex flex-col items-center">
                    <div className="relative w-20 h-20 mb-4">
                        <Image
                            src="/automatelogo.png"
                            alt="AutoMate"
                            fill
                            className="object-contain animate-pulse"
                        />
                    </div>
                    <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="min-h-screen overflow-hidden relative flex items-center justify-center">
            {/* SVG Background */}
            <svg
                className="absolute inset-0 w-full h-full z-0"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 1920 1080"
                preserveAspectRatio="xMidYMid slice"
            >
                <defs>
                    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="80" />
                    </filter>
                    <radialGradient id="blob1" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.9" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id="blob2" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#ec4899" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id="blob3" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                    </radialGradient>
                </defs>
                <rect width="100%" height="100%" fill="#faf9fb" />
                <g filter="url(#blur)">
                    <ellipse cx="400" cy="300" rx="500" ry="400" fill="url(#blob1)">
                        <animate attributeName="cx" values="400;500;400" dur="20s" repeatCount="indefinite" />
                        <animate attributeName="cy" values="300;400;300" dur="25s" repeatCount="indefinite" />
                    </ellipse>
                    <ellipse cx="1500" cy="200" rx="450" ry="350" fill="url(#blob2)">
                        <animate attributeName="cx" values="1500;1400;1500" dur="22s" repeatCount="indefinite" />
                        <animate attributeName="cy" values="200;300;200" dur="18s" repeatCount="indefinite" />
                    </ellipse>
                    <ellipse cx="900" cy="800" rx="600" ry="450" fill="url(#blob3)">
                        <animate attributeName="cx" values="900;1000;900" dur="24s" repeatCount="indefinite" />
                        <animate attributeName="cy" values="800;700;800" dur="20s" repeatCount="indefinite" />
                    </ellipse>
                </g>
            </svg>

            {/* Login Form */}
            <div ref={formRef} className="relative z-10 w-full max-w-md mx-4">
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/30">
                    {/* Logo */}
                    <div className="flex justify-center mb-6">
                        <div className="relative w-16 h-16">
                            <Image
                                src="/automatelogo.png"
                                alt="AutoMate"
                                fill
                                className="object-contain"
                            />
                        </div>
                    </div>

                    <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
                        Welcome back
                    </h1>
                    <p className="text-center text-gray-600 mb-8">
                        Sign in to continue to AutoMate
                    </p>

                    {/* GitHub Login */}
                    <button
                        onClick={handleGitHubLogin}
                        className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] mb-6"
                    >
                        <Github className="w-5 h-5" />
                        Continue with GitHub
                    </button>

                    <div className="relative mb-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-200" />
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-4 bg-white/80 text-gray-500">or continue with email</span>
                        </div>
                    </div>

                    {/* Email Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                                {error}
                            </div>
                        )}

                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Email address"
                                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-gray-900"
                                required
                            />
                        </div>

                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Password"
                                className="w-full pl-12 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-gray-900"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20"
                        >
                            {isLoading ? (
                                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                            ) : (
                                <>
                                    Sign In
                                    <ArrowRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>

                    <p className="text-center text-gray-600 mt-6">
                        Don&apos;t have an account?{' '}
                        <Link href="/signup" className="text-blue-600 hover:underline font-medium">
                            Sign up
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
