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
                    className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Icon */}
                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
                        <LogIn className="w-8 h-8 text-white" />
                    </div>
                </div>

                {/* Content */}
                <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
                    Sign in required
                </h2>
                <p className="text-center text-gray-600 mb-8">
                    {message || 'Please sign in to continue using AutoMate'}
                </p>

                {/* Actions */}
                <div className="space-y-3">
                    <button
                        onClick={handleGitHubLogin}
                        className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Github className="w-5 h-5" />
                        Continue with GitHub
                    </button>

                    <div className="flex gap-3">
                        <Link
                            href="/login"
                            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <LogIn className="w-4 h-4" />
                            Sign In
                        </Link>
                        <Link
                            href="/signup"
                            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
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
