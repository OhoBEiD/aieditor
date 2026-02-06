'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { RecentProjectsTable } from '@/components/landing/RecentProjectsTable';
import { useAuth } from '@/contexts/AuthContext';

export default function ProjectsPage() {
    const router = useRouter();
    const { user, isAuthenticated, isLoading: authLoading } = useAuth();

    // Refs for GSAP animations
    const logoRef = useRef<HTMLDivElement>(null);
    const brandRef = useRef<HTMLSpanElement>(null);
    const headerContentRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    // Use GSAP for entry animations
    useEffect(() => {
        const ctx = gsap.context(() => {
            const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

            // Animate Logo
            tl.fromTo(logoRef.current,
                { y: -20, opacity: 0, rotation: -90 },
                { y: 0, opacity: 1, rotation: 0, duration: 0.6 }
            );

            // Animate Brand
            tl.fromTo(brandRef.current,
                { x: -20, opacity: 0 },
                { x: 0, opacity: 1, duration: 0.4 },
                '-=0.4'
            );

            // Animate Header Content
            tl.fromTo(headerContentRef.current,
                { y: 20, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.5 },
                '-=0.2'
            );

            // Animate Grid - Stagger children if possible, otherwise just fade in the container
            tl.fromTo(gridRef.current,
                { y: 30, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.6 },
                '-=0.3'
            );
        });

        return () => ctx.revert();
    }, []);

    const handleOpenProject = (project: any) => {
        router.push(`/?site=${project.siteKey}`);
    };

    return (
        <div
            className="relative min-h-screen w-full overflow-hidden"
            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
            {/* Animated SVG Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 1920 1080"
                    className="w-full h-full"
                    preserveAspectRatio="xMidYMid slice"
                >
                    <defs>
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

                    <rect width="100%" height="100%" fill="#ffffff" />

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

            {/* Header */}
            <header className="relative z-20 flex items-center justify-between px-8 py-6">
                <Link href="/" className="flex items-center gap-4">
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
                </Link>
            </header>

            {/* Content */}
            <div className="relative z-10 px-8 py-8 max-w-7xl mx-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 120px)' }}>
                {/* Page Header */}
                <div ref={headerContentRef} className="flex items-center gap-4 mb-8 opacity-0">
                    <Link
                        href="/"
                        className="p-2 rounded-full bg-white/60 hover:bg-white/90 transition-all border border-white/30 shadow-sm hover:shadow-md"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">All Projects</h1>
                    </div>
                </div>

                <div ref={gridRef} className="opacity-0">
                    {!authLoading && !isAuthenticated ? (
                        <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-white/30 p-8 text-center text-gray-600">
                            Sign in to see your projects.
                        </div>
                    ) : (
                        <RecentProjectsTable
                            userId={user?.id ?? null}
                            onOpen={handleOpenProject}
                            limit={10}
                            showPagination={true}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
