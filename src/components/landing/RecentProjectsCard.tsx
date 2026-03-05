'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Box, ArrowRight, MoreVertical, Pencil, Trash2, X, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface RecentProjectsCardProps {
    onOpen: (project?: any) => void;
    /** When provided, only this user's projects are shown. Omit when signed out. */
    userId?: string | null;
}

interface Project {
    id: string;
    name: string;
    updated_at: string;
    repo_url: string;
    site_key: string;
    preview_subdomain: string;
}

export function RecentProjectsCard({ onOpen, userId }: RecentProjectsCardProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchRecentProjects = async () => {
            if (!userId) {
                setProjects([]);
                setLoading(false);
                return;
            }
            try {
                const { data, error } = await supabase
                    .from('sites')
                    .select('*')
                    .neq('id', '00000000-0000-0000-0000-000000000000')
                    .eq('user_id', userId)
                    .order('updated_at', { ascending: false })
                    .limit(20);

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
                console.error('Failed to fetch recent projects:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchRecentProjects();
    }, [userId]);

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

    const handleOpen = (project: Project) => {
        onOpen({
            id: project.id,
            siteKey: project.site_key,
            name: project.name,
            repoUrl: project.repo_url,
            previewSubdomain: project.preview_subdomain
        });
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

    const getTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) return 'just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return `${Math.floor(diffInSeconds / 86400)}d ago`;
    };

    if (loading) return null;
    if (projects.length === 0) return null;

    return (
        <div className="mt-12 w-full max-w-5xl mx-auto px-4 pb-12">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-semibold text-[#84745b]">Recent Projects</h2>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-[#4a3f32] bg-[#d6cfc9]/50 backdrop-blur-md px-3 py-1 rounded-full border border-[#b69161]/30">
                        {projects.length} project{projects.length !== 1 ? 's' : ''}
                    </span>
                    {projects.length > 3 && (
                        <Link
                            href="/projects"
                            className="px-4 py-1.5 text-sm font-medium text-[#2c2418] rounded-full transition-all hover:scale-105 bg-[#b69161] hover:bg-[#b69161] shadow-lg shadow-[#b69161]/30"
                        >
                            View All Projects
                        </Link>
                    )}
                </div>
            </div>

            {/* Delete Confirmation Modal - Modern Design */}
            {deleteConfirmId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ animation: 'fadeIn 0.2s ease-out' }}
                >
                    {/* Backdrop with blur */}
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-md"
                        onClick={() => setDeleteConfirmId(null)}
                        style={{ animation: 'fadeIn 0.2s ease-out' }}
                    />

                    {/* Modal Container */}
                    <div
                        className="relative w-full max-w-md"
                        style={{ animation: 'modalSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                    >
                        {/* Animated gradient border */}
                        <div className="absolute -inset-[2px] rounded-3xl bg-gradient-to-r from-red-500 via-[#b69161] to-red-500 opacity-75 blur-sm animate-pulse" />
                        <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-r from-red-400 via-[#b69161] to-red-400"
                            style={{
                                backgroundSize: '200% 200%',
                                animation: 'gradientShift 3s ease infinite'
                            }}
                        />

                        {/* Modal Content */}
                        <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl p-8 shadow-2xl overflow-hidden">
                            {/* Decorative Elements */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                            <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#b69161]/10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none" />

                            {/* Animated Warning Icon */}
                            <div className="flex justify-center mb-6">
                                <div
                                    className="relative"
                                    style={{ animation: 'bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both' }}
                                >
                                    {/* Pulse rings */}
                                    <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" style={{ animationDuration: '1.5s' }} />
                                    <div className="absolute inset-2 rounded-full bg-red-500/30 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.3s' }} />

                                    {/* Icon container */}
                                    <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-[#b69161] flex items-center justify-center shadow-lg shadow-red-500/30">
                                        <Trash2
                                            className="w-10 h-10 text-white"
                                            style={{ animation: 'shake 0.5s ease-in-out 0.3s' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Title */}
                            <h3
                                className="text-2xl font-bold text-center text-[#2c2418] mb-3"
                                style={{ animation: 'slideUp 0.3s ease-out 0.15s both' }}
                            >
                                Delete Project?
                            </h3>

                            {/* Project Name Preview */}
                            <div
                                className="mb-4 px-4 py-3 bg-[#f2efed] rounded-xl border border-[#d6cfc9]"
                                style={{ animation: 'slideUp 0.3s ease-out 0.2s both' }}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-gradient-to-br from-red-100 to-[#e6e0dd]">
                                        <Box className="w-4 h-4 text-red-500" />
                                    </div>
                                    <span className="font-medium text-[#3d3122] truncate">
                                        {projects.find(p => p.id === deleteConfirmId)?.name || 'This project'}
                                    </span>
                                </div>
                            </div>

                            {/* Warning Message */}
                            <p
                                className="text-center text-[#7a6f60] mb-8 leading-relaxed"
                                style={{ animation: 'slideUp 0.3s ease-out 0.25s both' }}
                            >
                                This will <span className="font-semibold text-red-500">permanently delete</span> the project
                                and its GitHub repository. This action cannot be undone.
                            </p>

                            {/* Action Buttons */}
                            <div
                                className="flex gap-4"
                                style={{ animation: 'slideUp 0.3s ease-out 0.3s both' }}
                            >
                                <button
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="flex-1 group relative px-6 py-3.5 font-semibold text-[#4a3f32] rounded-2xl transition-all duration-300 overflow-hidden hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    {/* Button background */}
                                    <div className="absolute inset-0 bg-[#e6e0dd] group-hover:bg-[#d6cfc9] transition-colors" />
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] duration-700" />

                                    <span className="relative flex items-center justify-center gap-2">
                                        <X className="w-4 h-4" />
                                        Cancel
                                    </span>
                                </button>

                                <button
                                    onClick={() => handleDelete(deleteConfirmId)}
                                    className="flex-1 group relative px-6 py-3.5 font-semibold text-white rounded-2xl transition-all duration-300 overflow-hidden hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-red-500/30 hover:shadow-xl hover:shadow-red-500/40"
                                >
                                    {/* Animated gradient background */}
                                    <div
                                        className="absolute inset-0 bg-gradient-to-r from-red-500 via-red-600 to-[#b69161]"
                                        style={{
                                            backgroundSize: '200% 100%',
                                            animation: 'gradientShift 2s ease infinite'
                                        }}
                                    />
                                    {/* Shine effect */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] duration-700" />

                                    <span className="relative flex items-center justify-center gap-2">
                                        <Trash2 className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                                        Delete Forever
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Keyframe Animations */}
                    <style jsx>{`
                        @keyframes fadeIn {
                            from { opacity: 0; }
                            to { opacity: 1; }
                        }
                        @keyframes modalSlideIn {
                            from { 
                                opacity: 0;
                                transform: scale(0.9) translateY(20px);
                            }
                            to { 
                                opacity: 1;
                                transform: scale(1) translateY(0);
                            }
                        }
                        @keyframes slideUp {
                            from {
                                opacity: 0;
                                transform: translateY(10px);
                            }
                            to {
                                opacity: 1;
                                transform: translateY(0);
                            }
                        }
                        @keyframes bounceIn {
                            0% {
                                opacity: 0;
                                transform: scale(0.3);
                            }
                            50% {
                                transform: scale(1.1);
                            }
                            70% {
                                transform: scale(0.9);
                            }
                            100% {
                                opacity: 1;
                                transform: scale(1);
                            }
                        }
                        @keyframes shake {
                            0%, 100% { transform: rotate(0deg); }
                            25% { transform: rotate(-10deg); }
                            75% { transform: rotate(10deg); }
                        }
                        @keyframes gradientShift {
                            0%, 100% { background-position: 0% 50%; }
                            50% { background-position: 100% 50%; }
                        }
                    `}</style>
                </div>
            )}

            {/* Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.slice(0, 3).map((project, index) => (
                    <div
                        key={project.id}
                        className="relative group cursor-pointer animate-fade-in"
                        style={{ animationDelay: `${index * 0.1}s` }}
                    >
                        {/* Glow Effect */}
                        <div className="absolute -inset-2 bg-gradient-to-r from-[#b69161]/20 via-[#c9a474]/20 to-[#b69161]/20 rounded-3xl blur-md opacity-0 group-hover:opacity-70 transition duration-500 will-change-opacity"></div>

                        {/* Main Card */}
                        <div
                            className="relative w-full aspect-[4/3] backdrop-blur-xl border border-[#b69161]/40 rounded-2xl p-5 flex flex-col justify-between shadow-lg hover:shadow-2xl transition-all duration-300 group-hover:scale-[1.02] group-hover:-translate-y-1 overflow-hidden"
                            style={{
                                background: 'linear-gradient(145deg, rgba(182, 145, 97, 0.12) 0%, rgba(214, 207, 201, 0.1) 50%, rgba(182, 145, 97, 0.12) 100%)',
                                boxShadow: '0 8px 32px rgba(44, 36, 24, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
                            }}
                            onClick={() => !editingId && !menuOpenId && handleOpen(project)}
                        >
                            {/* Background shimmer */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-white/10 z-0 pointer-events-none opacity-50 group-hover:opacity-80 transition-opacity duration-500"></div>

                            {/* Decorational blobs */}
                            <div className="absolute top-0 right-0 w-24 h-24 bg-[#c9a474]/30 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none group-hover:bg-[#b69161]/40 transition-colors"></div>
                            <div className="absolute bottom-0 left-0 w-24 h-24 bg-[#d6cfc9]/30 rounded-full blur-2xl -ml-8 -mb-8 pointer-events-none group-hover:bg-[#c9a474]/40 transition-colors"></div>

                            {/* Content */}
                            <div className="relative z-10 flex flex-col h-full">
                                {/* Header */}
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 rounded-xl bg-white/40 backdrop-blur-sm border border-[#b69161]/30 shadow-sm group-hover:shadow-md transition-shadow">
                                        <Box className="w-5 h-5 text-[#84745b]" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {index === 0 && (
                                            <div className="px-2.5 py-1 rounded-full bg-green-500/80 backdrop-blur-sm border border-green-400/50 text-[10px] font-bold text-white uppercase tracking-wide shadow-sm">
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
                                                className="p-1.5 rounded-lg hover:bg-[#d6cfc9]/50 transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <MoreVertical className="w-4 h-4 text-[#4a3f32]" />
                                            </button>
                                            {menuOpenId === project.id && (
                                                <div
                                                    className="absolute right-0 top-full mt-1 w-36 backdrop-blur-xl border border-[#b69161]/40 rounded-xl shadow-xl z-50 overflow-hidden"
                                                    style={{
                                                        background: 'linear-gradient(135deg, rgba(242, 239, 237, 0.97) 0%, rgba(246, 244, 242, 0.95) 100%)',
                                                    }}
                                                >
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingId(project.id);
                                                            setEditName(project.name);
                                                            setMenuOpenId(null);
                                                        }}
                                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#3d3122] hover:bg-[#d6cfc9]/40 transition-colors"
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
                                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-500/20 transition-colors"
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
                                                className="flex-1 text-base font-bold text-[#2c2418] bg-white/60 backdrop-blur-sm border border-[#b69161]/40 rounded-lg px-2 py-1 outline-none focus:border-[#b69161]"
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
                                                className="p-1 rounded bg-green-500/80 hover:bg-green-500 text-white"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setEditingId(null);
                                                    setEditName('');
                                                }}
                                                className="p-1 rounded bg-[#a89d8e]/50 hover:bg-[#a89d8e]/70 text-white"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <h3 className="text-base font-bold text-[#2c2418] mb-1.5 truncate group-hover:text-[#2c2418] transition-colors" title={project.name}>
                                            {project.name}
                                        </h3>
                                    )}
                                    <div className="flex items-center gap-2 text-xs text-[#4a3f32]">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#b69161]/60 group-hover:bg-[#84745b] transition-colors"></span>
                                        {getTimeAgo(project.updated_at)}
                                    </div>
                                </div>

                                {/* Action Area */}
                                <div className="mt-auto pt-4 border-t border-[#b69161]/20 flex items-center justify-between group-hover:border-[#b69161]/40 transition-colors">
                                    <span className="text-xs font-medium text-[#4a3f32] group-hover:text-[#2c2418] transition-colors">Open Project</span>
                                    <div className="p-1.5 rounded-full bg-white/40 group-hover:bg-white/60 transition-all group-hover:translate-x-1">
                                        <ArrowRight className="w-3.5 h-3.5 text-[#84745b] group-hover:text-[#2c2418] transition-colors" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
