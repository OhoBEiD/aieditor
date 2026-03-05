'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Lock, Github, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { gsap } from 'gsap';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import VantaFogBackground from '@/components/common/VantaFogBackground';

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
                <VantaFogBackground />

                <div className="relative z-10 flex flex-col items-center">
                    <div className="relative w-20 h-20 mb-4">
                        <Image
                            src="/automatelogo.png"
                            alt="Automate"
                            fill
                            className="object-contain animate-pulse"
                        />
                    </div>
                    <div className="animate-spin w-6 h-6 border-2 border-[#b69161] border-t-transparent rounded-full" />
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="min-h-screen overflow-hidden relative flex items-center justify-center">
            <VantaFogBackground />

            {/* Login Form */}
            <div ref={formRef} className="relative z-10 w-full max-w-md mx-4">
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/30">
                    {/* Logo */}
                    <div className="flex justify-center mb-6">
                        <div className="relative w-16 h-16">
                            <Image
                                src="/automatelogo.png"
                                alt="Automate"
                                fill
                                className="object-contain"
                            />
                        </div>
                    </div>

                    <h1 className="text-2xl font-bold text-center text-[#2c2418] mb-2">
                        Welcome back
                    </h1>
                    <p className="text-center text-[#7a6f60] mb-8">
                        Sign in to continue to Automate
                    </p>

                    {/* GitHub Login */}
                    <button
                        onClick={handleGitHubLogin}
                        className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-[#2c2418] hover:bg-[#4a3f32] text-white font-medium rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] mb-6"
                    >
                        <Github className="w-5 h-5" />
                        Continue with GitHub
                    </button>

                    <div className="relative mb-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-[#d6cfc9]" />
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-4 bg-white/80 text-[#7a6f60]">or continue with email</span>
                        </div>
                    </div>

                    {/* Email Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[#c45c4a] text-sm">
                                {error}
                            </div>
                        )}

                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#a89d8e]" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Email address"
                                className="w-full pl-12 pr-4 py-3 bg-[#f2efed] border border-[#d6cfc9] rounded-xl outline-none focus:border-[#b69161] focus:ring-2 focus:ring-[#b69161]/20 transition-all text-[#2c2418]"
                                required
                            />
                        </div>

                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#a89d8e]" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Password"
                                className="w-full pl-12 pr-12 py-3 bg-[#f2efed] border border-[#d6cfc9] rounded-xl outline-none focus:border-[#b69161] focus:ring-2 focus:ring-[#b69161]/20 transition-all text-[#2c2418]"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#a89d8e] hover:text-[#7a6f60]"
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#b69161] hover:bg-[#c9a474] text-white font-medium rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#b69161]/20"
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

                    <p className="text-center text-[#7a6f60] mt-6">
                        Don&apos;t have an account?{' '}
                        <Link href="/signup" className="text-[#b69161] hover:underline font-medium">
                            Sign up
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
