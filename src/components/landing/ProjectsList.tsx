'use client';

import React, { useEffect, useState } from 'react';
import { FolderOpen, Github, Plus, Clock, ExternalLink } from 'lucide-react';

interface Project {
    id: string;
    name: string;
    siteKey: string;
    repoUrl: string;
    previewSubdomain: string;
    sourceType: 'new' | 'imported';
    description: string | null;
    createdAt: string;
    updatedAt: string;
}

interface ProjectsListProps {
    onSelectProject: (project: Project) => void;
    onCreateNew: () => void;
}

export function ProjectsList({ onSelectProject, onCreateNew }: ProjectsListProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const response = await fetch('/api/projects/list');
                if (!response.ok) {
                    throw new Error('Failed to fetch projects');
                }
                const data = await response.json();
                setProjects(data.projects || []);
            } catch (err) {
                console.error('[Projects] Fetch error:', err);
                setError('Failed to load projects');
            } finally {
                setIsLoading(false);
            }
        };

        fetchProjects();
    }, []);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    if (isLoading) {
        return (
            <div className="mt-12 w-full max-w-4xl">
                <div className="flex items-center gap-2 text-gray-500">
                    <div className="animate-spin w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full" />
                    <span>Loading projects...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mt-12 w-full max-w-4xl text-red-500">
                {error}
            </div>
        );
    }

    if (projects.length === 0) {
        return null; // Don't show anything if no projects
    }

    return (
        <div className="mt-12 w-full max-w-4xl">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <FolderOpen className="w-5 h-5" />
                    Your Projects
                </h3>
                <button
                    onClick={onCreateNew}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    New
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((project) => (
                    <button
                        key={project.id}
                        onClick={() => onSelectProject(project)}
                        className="group relative p-5 text-left bg-white/70 hover:bg-white/90 backdrop-blur-sm rounded-2xl border border-white/30 shadow-sm hover:shadow-lg transition-all duration-200"
                    >
                        {/* Source badge */}
                        <div className="absolute top-3 right-3">
                            {project.sourceType === 'imported' ? (
                                <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-full">
                                    <Github className="w-3 h-3" />
                                    Imported
                                </span>
                            ) : (
                                <span className="px-2 py-0.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-full">
                                    Created
                                </span>
                            )}
                        </div>

                        {/* Project info */}
                        <h4 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors pr-20 truncate">
                            {project.name}
                        </h4>

                        {project.description && (
                            <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                                {project.description}
                            </p>
                        )}

                        {/* Footer */}
                        <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDate(project.updatedAt)}
                            </span>
                            <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
