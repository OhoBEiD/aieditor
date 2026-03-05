'use client';

import React from 'react';
import Link from 'next/link';
import { X, LogIn, UserPlus, Github } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface AuthRequiredModalProps {
    isOpen: boolean;
    onClose: () => void;
    message?: string;
}

export function AuthRequiredModal({ isOpen, onClose, message }: AuthRequiredModalProps) {
    const { signInWithGitHub } = useAuth();

    if (!isOpen) return null;

    const handleGitHubLogin = async () => {
        await signInWithGitHub();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative w-full max-w-md mx-4 bg-white rounded-3xl shadow-2xl p-8 animate-in fade-in zoom-in duration-200">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-[#a89d8e] hover:text-[#5a4f3e] transition-colors rounded-full hover:bg-[#e6e0dd]"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Icon */}
                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-[#b69161] to-[#84745b] rounded-2xl flex items-center justify-center">
                        <LogIn className="w-8 h-8 text-white" />
                    </div>
                </div>

                {/* Content */}
                <h2 className="text-2xl font-bold text-center text-[#2c2418] mb-2">
                    Sign in required
                </h2>
                <p className="text-center text-[#5a4f3e] mb-8">
                    {message || 'Please sign in to continue using Automate'}
                </p>

                {/* Actions */}
                <div className="space-y-3">
                    <button
                        onClick={handleGitHubLogin}
                        className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-[#2c2418] hover:bg-[#3d3122] text-white font-medium rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Github className="w-5 h-5" />
                        Continue with GitHub
                    </button>

                    <div className="flex gap-3">
                        <Link
                            href="/login"
                            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-[#b69161] hover:bg-[#c9a474] text-white font-medium rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#b69161]/20"
                        >
                            <LogIn className="w-4 h-4" />
                            Sign In
                        </Link>
                        <Link
                            href="/signup"
                            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-[#e6e0dd] hover:bg-[#d6cfc9] text-[#84745b] font-medium rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <UserPlus className="w-4 h-4" />
                            Sign Up
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
