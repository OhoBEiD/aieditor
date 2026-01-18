'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Box, ArrowRight, MoreVertical, Pencil, Trash2, X, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface RecentProjectsCardProps {
    onOpen: (project?: any) => void;
}

interface Project {
    id: string;
    name: string;
    updated_at: string;
    repo_url: string;
    site_key: string;
    preview_subdomain: string;
}

export function RecentProjectsCard({ onOpen }: RecentProjectsCardProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchRecentProjects = async () => {
            try {
                const { data, error } = await supabase
                    .from('sites')
                    .select('*')
                    .neq('id', '00000000-0000-0000-0000-000000000000')
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
                <h2 className="text-xl font-semibold text-gray-800">Recent Projects</h2>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 bg-white/50 px-3 py-1 rounded-full border border-gray-100">
                        {projects.length} project{projects.length !== 1 ? 's' : ''}
                    </span>
                    {projects.length > 3 && (
                        <Link
                            href="/projects"
                            className="px-4 py-1.5 text-sm font-medium text-white rounded-full transition-all hover:scale-105 bg-purple-500 hover:bg-purple-600 shadow-lg shadow-purple-500/20"
                        >
                            View All Projects
                        </Link>
                    )}
                </div>
            </div>

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

            {/* Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.slice(0, 3).map((project, index) => (
                    <div
                        key={project.id}
                        className="relative group cursor-pointer animate-fade-in"
                        style={{ animationDelay: `${index * 0.1}s` }}
                    >
                        {/* Glow Effect */}
                        <div className="absolute -inset-2 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 rounded-3xl blur-md opacity-0 group-hover:opacity-40 transition duration-500 will-change-opacity"></div>

                        {/* Main Card */}
                        <div
                            className="relative w-full aspect-[4/3] bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl p-5 flex flex-col justify-between shadow-sm hover:shadow-xl transition-all duration-300 group-hover:scale-[1.02] group-hover:-translate-y-1 overflow-hidden"
                            onClick={() => !editingId && !menuOpenId && handleOpen(project)}
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
        </div>
    );
}
