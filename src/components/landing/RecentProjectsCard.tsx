'use client';

import React, { useEffect, useState } from 'react';
import { Box, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
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
    const [visibleCount, setVisibleCount] = useState(3);

    useEffect(() => {
        const fetchRecentProjects = async () => {
            try {
                // Fetch more projects to support pagination
                const { data, error } = await supabase
                    .from('sites')
                    .select('*')
                    .neq('id', '00000000-0000-0000-0000-000000000000') // Exclude default
                    .order('updated_at', { ascending: false })
                    .limit(20); // Increase limit to fetch more potential projects

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

    const handleOpen = (project: Project) => {
        // Construct the project object expected by startPreview
        onOpen({
            id: project.id,
            siteKey: project.site_key,
            name: project.name,
            repoUrl: project.repo_url,
            previewSubdomain: project.preview_subdomain
        });
    };

    // Format date relative (e.g. "2 hours ago")
    const getTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) return 'just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return `${Math.floor(diffInSeconds / 86400)}d ago`;
    };

    const handleLoadMore = () => {
        setVisibleCount(prev => prev + 3);
    };

    if (loading) return null;
    if (projects.length === 0) return null;

    return (
        <div className="mt-12 w-full max-w-5xl mx-auto px-4 pb-12">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-semibold text-gray-800">Recent Projects</h2>
                <span className="text-sm text-gray-500 bg-white/50 px-3 py-1 rounded-full border border-gray-100">
                    {projects.length} project{projects.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.slice(0, visibleCount).map((project, index) => (
                    <div
                        key={project.id}
                        className="relative group cursor-pointer animate-fade-in"
                        onClick={() => handleOpen(project)}
                        style={{ animationDelay: `${index * 0.1}s` }}
                    >
                        {/* Glow Effect - Adjusted spread and positioning */}
                        <div className="absolute -inset-2 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 rounded-3xl blur-md opacity-0 group-hover:opacity-40 transition duration-500 will-change-opacity"></div>

                        {/* Main Card */}
                        <div className="relative w-full aspect-[4/3] bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl p-5 flex flex-col justify-between shadow-sm hover:shadow-xl transition-all duration-300 group-hover:scale-[1.02] group-hover:-translate-y-1 overflow-hidden">
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
                                    {index === 0 && (
                                        <div className="px-2.5 py-1 rounded-full bg-green-100/80 border border-green-200 text-[10px] font-bold text-green-700 uppercase tracking-wide shadow-sm backdrop-blur-sm">
                                            Latest
                                        </div>
                                    )}
                                </div>

                                {/* Title & Info */}
                                <div>
                                    <h3 className="text-base font-bold text-gray-800 mb-1.5 truncate group-hover:text-blue-700 transition-colors" title={project.name}>
                                        {project.name}
                                    </h3>
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

            {/* Load More Button */}
            {visibleCount < projects.length && (
                <div className="mt-10 flex justify-center">
                    <button
                        onClick={handleLoadMore}
                        className="group flex items-center gap-2 px-6 py-3 bg-white/60 hover:bg-white/90 text-gray-600 hover:text-gray-900 rounded-full border border-gray-200/50 hover:border-gray-300 shadow-sm hover:shadow-md transition-all duration-300 backdrop-blur-sm"
                    >
                        <span className="text-sm font-medium">Load more projects</span>
                        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                </div>
            )}
        </div>
    );
}
