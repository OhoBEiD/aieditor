'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Box, MoreVertical, Pencil, Trash2, X, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface RecentProjectsTableProps {
    onOpen: (project?: any) => void;
    limit?: number;
    showPagination?: boolean;
}

interface Project {
    id: string;
    name: string;
    updated_at: string;
    repo_url: string;
    site_key: string;
    preview_subdomain: string;
}

export function RecentProjectsTable({ onOpen, limit = 5, showPagination = false }: RecentProjectsTableProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [totalProjects, setTotalProjects] = useState(0);

    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchProjects = async () => {
            try {
                // First get total count if pagination is enabled
                if (showPagination) {
                    const { count, error: countError } = await supabase
                        .from('sites')
                        .select('*', { count: 'exact', head: true })
                        .neq('id', '00000000-0000-0000-0000-000000000000');

                    if (countError) throw countError;
                    setTotalProjects(count || 0);
                }

                // Fetch data with pagination
                let query = supabase
                    .from('sites')
                    .select('*')
                    .neq('id', '00000000-0000-0000-0000-000000000000')
                    .order('updated_at', { ascending: false });

                if (showPagination) {
                    const from = (currentPage - 1) * limit;
                    const to = from + limit - 1;
                    query = query.range(from, to);
                } else {
                    query = query.limit(limit);
                }

                const { data, error } = await query;

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
    }, [limit, showPagination, currentPage]);

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
                const match = project.repo_url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
                if (match) {
                    const [, owner, repo] = match;
                    const { data: { session } } = await supabase.auth.getSession();
                    const githubToken = session?.provider_token;

                    if (githubToken) {
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

            const { error } = await supabase
                .from('sites')
                .delete()
                .eq('id', projectId);

            if (error) throw error;

            setProjects(prev => prev.filter(p => p.id !== projectId));
            setDeleteConfirmId(null);

            // Refresh logic could be added here if needed, but local state update is sufficient for UI
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

    if (loading) return (
        <div className="w-full max-w-5xl mx-auto mt-12 px-4 pb-12">
            <div className="animate-pulse space-y-4">
                <div className="h-8 bg-gray-200 rounded w-1/4"></div>
                <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-16 bg-gray-100 rounded-xl w-full"></div>
                    ))}
                </div>
            </div>
        </div>
    );

    if (projects.length === 0) return null;

    return (
        <div className="w-full max-w-5xl mx-auto mt-12 px-4 pb-12">
            {/* Section Header */}
            {!showPagination && (
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-gray-800">Recent Projects</h2>
                    {/* View All button removed as requested for table view on homepage? User said "just display 5 on homepage", usually implies View All goes to projects page. Keeping View All link if there are more. */}
                    <div className="flex items-center gap-3">
                        <Link
                            href="/projects"
                            className="px-4 py-1.5 text-sm font-medium text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-full transition-all"
                        >
                            View All
                        </Link>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
                    style={{ animation: 'fadeIn 0.2s ease-out' }}
                >
                    <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 pointer-events-auto">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Project?</h3>
                        <p className="text-gray-500 mb-6">
                            This will permanently delete <span className="font-semibold text-gray-800">{projects.find(p => p.id === deleteConfirmId)?.name}</span> and its GitHub repository.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirmId)}
                                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete Forever
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Table Layout */}
            <div className="bg-white/80 backdrop-blur-xl border border-white/60 rounded-3xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-100">
                                <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/2">Project Name</th>
                                <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Updated</th>
                                <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {projects.map((project) => (
                                <tr
                                    key={project.id}
                                    className="group hover:bg-blue-50/30 transition-colors border-b border-gray-50 last:border-none cursor-pointer"
                                    onClick={() => !editingId && !menuOpenId && handleOpen(project)}
                                >
                                    <td className="py-4 px-6">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100/50">
                                                <Box className="w-5 h-5 text-blue-600" />
                                            </div>
                                            {editingId === project.id ? (
                                                <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="text"
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        className="flex-1 text-sm font-bold text-gray-800 bg-white border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleRename(project.id);
                                                            if (e.key === 'Escape') {
                                                                setEditingId(null);
                                                                setEditName('');
                                                            }
                                                        }}
                                                    />
                                                    <button onClick={() => handleRename(project.id)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-4 h-4" /></button>
                                                    <button onClick={() => { setEditingId(null); setEditName(''); }} className="p-1 text-gray-500 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
                                                </div>
                                            ) : (
                                                <span className="font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">{project.name}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4 px-6">
                                        <span className="text-sm text-gray-500">{getTimeAgo(project.updated_at)}</span>
                                    </td>
                                    <td className="py-4 px-6 text-right">
                                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => handleOpen(project)}
                                                className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                Open
                                            </button>

                                            <div className="relative" ref={menuOpenId === project.id ? menuRef : null}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setMenuOpenId(menuOpenId === project.id ? null : project.id);
                                                    }}
                                                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                                >
                                                    <MoreVertical className="w-4 h-4" />
                                                </button>
                                                {menuOpenId === project.id && (
                                                    <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-100 rounded-xl shadow-xl z-50 overflow-hidden">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingId(project.id);
                                                                setEditName(project.name);
                                                                setMenuOpenId(null);
                                                            }}
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
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
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                            Delete
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {showPagination && totalProjects > limit && (
                    <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Previous
                        </button>
                        <span className="text-sm text-gray-500">
                            Page {currentPage} of {Math.ceil(totalProjects / limit)}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalProjects / limit), p + 1))}
                            disabled={currentPage === Math.ceil(totalProjects / limit)}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Next
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
