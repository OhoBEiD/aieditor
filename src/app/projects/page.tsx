'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Box, ArrowRight, ArrowLeft, MoreVertical, Pencil, Trash2, X, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';

interface Project {
    id: string;
    name: string;
    updated_at: string;
    repo_url: string;
    site_key: string;
    preview_subdomain: string;
}

export default function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const router = useRouter();
    const menuRef = useRef<HTMLDivElement>(null);

    // Refs for GSAP animations
    const logoRef = useRef<HTMLDivElement>(null);
    const brandRef = useRef<HTMLSpanElement>(null);
    const headerContentRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const { data, error } = await supabase
                    .from('sites')
                    .select('*')
                    .neq('id', '00000000-0000-0000-0000-000000000000')
                    .order('updated_at', { ascending: false });

                if (data) {
                    setProjects(data.map(d => ({
                        id: d.id,
                        name: d.name,
                        updated_at: d.updated_at,
                        repo_url: d.repo_url,
                        site_key: d.site_key,
                        preview_subdomain: d.preview_subdomain
                    })));
                }
            } catch (err) {
                console.error('Failed to fetch projects:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchProjects();
    }, []);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpenId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // GSAP animations
    useEffect(() => {
        const ctx = gsap.context(() => {
            const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, delay: 0.1 });

            tl.add('start');

            tl.fromTo(logoRef.current,
                { scale: 0.5, opacity: 0, rotation: -180, y: -50 },
                { scale: 1, opacity: 1, rotation: 0, y: 0, duration: 0.6, ease: 'back.out(2)' },
                'start'
            );

            gsap.to(logoRef.current, {
                y: -10,
                duration: 2,
                yoyo: true,
                repeat: -1,
                ease: "sine.inOut",
                delay: 0.7
            });

            tl.fromTo(brandRef.current,
                { x: -50, opacity: 0, scale: 0.8 },
                { x: 0, opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(1.5)' },
                'start+=0.1'
            );

            tl.fromTo(headerContentRef.current,
                { y: 30, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.5 },
                'start+=0.2'
            );
        });

        return () => ctx.revert();
    }, []);

    // Animate grid when projects load
    useEffect(() => {
        if (!loading && projects.length > 0 && gridRef.current) {
            const cards = gridRef.current.querySelectorAll('.project-card');
            gsap.fromTo(cards,
                { y: 50, opacity: 0, scale: 0.9 },
                {
                    y: 0,
                    opacity: 1,
                    scale: 1,
                    duration: 0.5,
                    stagger: 0.05,
                    ease: 'back.out(1.2)'
                }
            );
        }
    }, [loading, projects]);

    const getTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) return 'just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return `${Math.floor(diffInSeconds / 86400)}d ago`;
    };

    const handleOpenProject = (project: Project) => {
        router.push(`/?site=${project.site_key}`);
    };

    const handleRename = async (projectId: string) => {
        if (!editName.trim()) return;

        try {
            const { error } = await supabase
                .from('sites')
                .update({ name: editName.trim() })
                .eq('id', projectId);

            if (error) throw error;

            setProjects(prev => prev.map(p =>
                p.id === projectId ? { ...p, name: editName.trim() } : p
            ));
            setEditingId(null);
            setEditName('');
        } catch (err) {
            console.error('Failed to rename project:', err);
        }
    };

    const handleDelete = async (projectId: string) => {
        try {
            // Find the project to get repo_url
            const project = projects.find(p => p.id === projectId);
            if (project?.repo_url) {
                // Extract owner and repo from URL (e.g., https://github.com/OhoBEiD/repo-name)
                const match = project.repo_url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
                if (match) {
                    const [, owner, repo] = match;
                    // Get GitHub token from session
                    const { data: { session } } = await supabase.auth.getSession();
                    const githubToken = session?.provider_token;

                    if (githubToken) {
                        // Delete GitHub repository
                        try {
                            const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
                                method: 'DELETE',
                                headers: {
                                    'Authorization': `Bearer ${githubToken}`,
                                    'Accept': 'application/vnd.github+json',
                                },
                            });
                            if (response.ok || response.status === 404) {
                                console.log(`GitHub repo ${owner}/${repo} deleted`);
                            } else {
                                console.warn(`Failed to delete GitHub repo: ${response.status}`);
                            }
                        } catch (ghErr) {
                            console.warn('GitHub delete failed:', ghErr);
                        }
                    }
                }
            }

            // Delete from Supabase
            const { error } = await supabase
                .from('sites')
                .delete()
                .eq('id', projectId);

            if (error) throw error;

            setProjects(prev => prev.filter(p => p.id !== projectId));
            setDeleteConfirmId(null);
        } catch (err) {
            console.error('Failed to delete project:', err);
        }
    };

    return (
        <div
            className="relative min-h-screen w-full overflow-hidden"
            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Project?</h3>
                        <p className="text-sm text-gray-500 mb-6">
                            This will permanently delete this project. This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirmId)}
                                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                        <p className="text-gray-500 text-sm mt-1">{projects.length} project{projects.length !== 1 ? 's' : ''} total</p>
                    </div>
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="flex justify-center py-20">
                        <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-purple-600 animate-spin" />
                    </div>
                )}

                {/* Empty State */}
                {!loading && projects.length === 0 && (
                    <div className="text-center py-20">
                        <Box className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-gray-700 mb-2">No projects yet</h2>
                        <p className="text-gray-500 mb-6">Start by creating your first project</p>
                        <Link
                            href="/"
                            className="inline-flex px-6 py-3 text-sm font-medium text-white rounded-full transition-all hover:scale-105 hover:shadow-lg hover:shadow-blue-500/25"
                            style={{
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            }}
                        >
                            Create Project
                        </Link>
                    </div>
                )}

                {/* Projects Grid */}
                {!loading && projects.length > 0 && (
                    <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8">
                        {projects.map((project, index) => (
                            <div
                                key={project.id}
                                className="project-card relative group cursor-pointer opacity-0"
                            >
                                {/* Glow Effect */}
                                <div className="absolute -inset-2 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 rounded-3xl blur-md opacity-0 group-hover:opacity-40 transition duration-500 will-change-opacity"></div>

                                {/* Main Card */}
                                <div
                                    className="relative w-full aspect-[4/3] bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl p-5 flex flex-col justify-between shadow-sm hover:shadow-xl transition-all duration-300 group-hover:scale-[1.02] group-hover:-translate-y-1 overflow-hidden"
                                    onClick={() => !editingId && !menuOpenId && handleOpenProject(project)}
                                >
                                    {/* Background gradient */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-purple-50/50 to-pink-50/50 z-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                                    {/* Decorational blobs */}
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-400/10 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none group-hover:bg-blue-400/20 transition-colors"></div>
                                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-400/10 rounded-full blur-2xl -ml-8 -mb-8 pointer-events-none group-hover:bg-purple-400/20 transition-colors"></div>

                                    {/* Content */}
                                    <div className="relative z-10 flex flex-col h-full">
                                        {/* Header */}
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="p-2 rounded-xl bg-gradient-to-br from-white to-gray-50 border border-gray-100 shadow-sm group-hover:shadow-md transition-shadow">
                                                <Box className="w-5 h-5 text-blue-600" />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {index === 0 && (
                                                    <div className="px-2.5 py-1 rounded-full bg-green-100/80 border border-green-200 text-[10px] font-bold text-green-700 uppercase tracking-wide shadow-sm backdrop-blur-sm">
                                                        Latest
                                                    </div>
                                                )}
                                                {/* Menu Button */}
                                                <div className="relative" ref={menuOpenId === project.id ? menuRef : null}>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setMenuOpenId(menuOpenId === project.id ? null : project.id);
                                                        }}
                                                        className="p-1.5 rounded-lg hover:bg-gray-100/80 transition-colors opacity-0 group-hover:opacity-100"
                                                    >
                                                        <MoreVertical className="w-4 h-4 text-gray-500" />
                                                    </button>
                                                    {menuOpenId === project.id && (
                                                        <div className="absolute right-0 top-full mt-1 w-36 bg-white/95 backdrop-blur-xl border border-gray-100 rounded-xl shadow-xl z-50 overflow-hidden">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setEditingId(project.id);
                                                                    setEditName(project.name);
                                                                    setMenuOpenId(null);
                                                                }}
                                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5" />
                                                                Rename
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setDeleteConfirmId(project.id);
                                                                    setMenuOpenId(null);
                                                                }}
                                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                Delete
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Title & Info */}
                                        <div>
                                            {editingId === project.id ? (
                                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="text"
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        className="flex-1 text-base font-bold text-gray-800 bg-white/80 border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-blue-400"
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleRename(project.id);
                                                            if (e.key === 'Escape') {
                                                                setEditingId(null);
                                                                setEditName('');
                                                            }
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => handleRename(project.id)}
                                                        className="p-1 rounded bg-green-100 hover:bg-green-200 text-green-600"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setEditingId(null);
                                                            setEditName('');
                                                        }}
                                                        className="p-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <h3 className="text-base font-bold text-gray-800 mb-1.5 truncate group-hover:text-blue-700 transition-colors" title={project.name}>
                                                    {project.name}
                                                </h3>
                                            )}
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 group-hover:bg-blue-400 transition-colors"></span>
                                                {getTimeAgo(project.updated_at)}
                                            </div>
                                        </div>

                                        {/* Action Area */}
                                        <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between group-hover:border-blue-100 transition-colors">
                                            <span className="text-xs font-medium text-gray-500 group-hover:text-blue-600 transition-colors">Open Project</span>
                                            <div className="p-1.5 rounded-full bg-gray-50 group-hover:bg-blue-50 transition-all group-hover:translate-x-1">
                                                <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
