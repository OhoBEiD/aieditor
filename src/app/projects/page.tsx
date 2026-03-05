'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { RecentProjectsTable } from '@/components/landing/RecentProjectsTable';
import { useAuth } from '@/contexts/AuthContext';
import VantaFogBackground from '@/components/common/VantaFogBackground';

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
            {/* Animated Vanta Fog Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <VantaFogBackground />
            </div>

            {/* Header */}
            <header className="relative z-20 flex items-center justify-between px-8 py-6">
                <Link href="/" className="flex items-center gap-4">
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
                        className="text-3xl font-bold text-[#2c2418] tracking-tight opacity-0"
                        style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}
                    >
                        Automate
                    </span>
                </Link>
            </header>

            {/* Content */}
            <div className="relative z-10 px-8 py-8 max-w-7xl mx-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 120px)' }}>
                {/* Page Header */}
                <div ref={headerContentRef} className="flex items-center gap-4 mb-8 opacity-0">
                    <Link
                        href="/"
                        className="p-2 rounded-full bg-white/60 hover:bg-white/90 transition-all border border-[#b69161]/15 shadow-sm hover:shadow-md"
                    >
                        <ArrowLeft className="w-5 h-5 text-[#7a6f60]" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-[#2c2418]">All Projects</h1>
                    </div>
                </div>

                <div ref={gridRef} className="opacity-0">
                    {!authLoading && !isAuthenticated ? (
                        <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-[#b69161]/15 p-8 text-center text-[#7a6f60]">
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
