'use client';

import React, { useState, useEffect } from 'react';
import { X, Github, Search, Lock, Globe, GitBranch, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Repo {
    id: number;
    name: string;
    fullName: string;
    url: string;
    description: string | null;
    isPrivate: boolean;
    defaultBranch: string;
    lastPushed: string;
    language: string | null;
}

interface RepoSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectRepo: (repo: Repo) => void;
}

export function RepoSelectorModal({ isOpen, onClose, onSelectRepo }: RepoSelectorModalProps) {
    const [repos, setRepos] = useState<Repo[]>([]);
    const [filteredRepos, setFilteredRepos] = useState<Repo[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [needsConnection, setNeedsConnection] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { signInWithGitHub, session } = useAuth();

    useEffect(() => {
        if (!isOpen) return;

        const fetchRepos = async () => {
            setIsLoading(true);
            setError(null);
            setNeedsConnection(false);

            // Check if we have a GitHub token from OAuth
            const providerToken = session?.provider_token;

            if (!providerToken) {
                // No GitHub OAuth token - need to connect
                setNeedsConnection(true);
                setIsLoading(false);
                return;
            }

            try {
                // Call GitHub API directly with the provider token
                const response = await fetch(
                    'https://api.github.com/user/repos?sort=pushed&per_page=50&affiliation=owner,collaborator',
                    {
                        headers: {
                            'Authorization': `Bearer ${providerToken}`,
                            'Accept': 'application/vnd.github+json',
                        },
                    }
                );

                if (!response.ok) {
                    if (response.status === 401) {
                        setNeedsConnection(true);
                    } else {
                        setError('Failed to fetch repositories');
                    }
                    return;
                }

                const data = await response.json();

                // Format repos
                const formattedRepos = data.map((repo: { id: number; name: string; full_name: string; html_url: string; description: string | null; private: boolean; default_branch: string; pushed_at: string; language: string | null }) => ({
                    id: repo.id,
                    name: repo.name,
                    fullName: repo.full_name,
                    url: repo.html_url,
                    description: repo.description,
                    isPrivate: repo.private,
                    defaultBranch: repo.default_branch,
                    lastPushed: repo.pushed_at,
                    language: repo.language,
                }));

                setRepos(formattedRepos);
                setFilteredRepos(formattedRepos);
            } catch (err) {
                console.error('[Repo Selector] Error:', err);
                setError('Failed to load repositories');
            } finally {
                setIsLoading(false);
            }
        };

        fetchRepos();
    }, [isOpen, session?.provider_token]);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredRepos(repos);
        } else {
            const query = searchQuery.toLowerCase();
            setFilteredRepos(
                repos.filter(
                    (repo) =>
                        repo.name.toLowerCase().includes(query) ||
                        repo.fullName.toLowerCase().includes(query) ||
                        repo.description?.toLowerCase().includes(query)
                )
            );
        }
    }, [searchQuery, repos]);

    const handleConnectGitHub = async () => {
        await signInWithGitHub();
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString();
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <div className="relative w-full max-w-2xl mx-4 bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-[#e6e0dd]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#e6e0dd] rounded-xl">
                            <Github className="w-6 h-6 text-[#4a3f32]" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-[#2c2418]">Select Repository</h3>
                            <p className="text-sm text-[#7a6f60]">Choose a repo to import</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-[#a89d8e] hover:text-[#5a4f3e] transition-colors rounded-full hover:bg-[#e6e0dd]"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {needsConnection ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-8">
                            <div className="w-16 h-16 bg-[#e6e0dd] rounded-full flex items-center justify-center mb-4">
                                <Github className="w-8 h-8 text-[#a89d8e]" />
                            </div>
                            <h4 className="text-lg font-semibold text-[#2c2418] mb-2">
                                Connect your GitHub
                            </h4>
                            <p className="text-[#7a6f60] text-center mb-6 max-w-sm">
                                Grant access to your repositories to import and edit them with Automate
                            </p>
                            <button
                                onClick={handleConnectGitHub}
                                className="flex items-center gap-2 px-6 py-3 bg-[#2c2418] hover:bg-[#3d3122] text-white font-medium rounded-xl transition-all"
                            >
                                <Github className="w-5 h-5" />
                                Connect GitHub
                            </button>
                        </div>
                    ) : isLoading ? (
                        <div className="flex-1 flex items-center justify-center p-8">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                    ) : error ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-8">
                            <p className="text-red-500 mb-4">{error}</p>
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 bg-[#e6e0dd] hover:bg-[#d6cfc9] rounded-lg transition-colors"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Search */}
                            <div className="p-4 border-b border-[#e6e0dd]">
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#a89d8e]" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search repositories..."
                                        className="w-full pl-12 pr-4 py-3 bg-[#f2efed] border border-[#d6cfc9] rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-[#2c2418]"
                                    />
                                </div>
                            </div>

                            {/* Repo List */}
                            <div className="flex-1 overflow-y-auto p-4">
                                {filteredRepos.length === 0 ? (
                                    <div className="text-center py-8 text-[#7a6f60]">
                                        No repositories found
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {filteredRepos.map((repo) => (
                                            <button
                                                key={repo.id}
                                                onClick={() => onSelectRepo(repo)}
                                                className="w-full p-4 text-left bg-[#f2efed] hover:bg-blue-50 rounded-xl transition-colors group"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-[#2c2418] group-hover:text-blue-600 truncate">
                                                                {repo.fullName}
                                                            </span>
                                                            {repo.isPrivate ? (
                                                                <Lock className="w-4 h-4 text-[#a89d8e] flex-shrink-0" />
                                                            ) : (
                                                                <Globe className="w-4 h-4 text-[#a89d8e] flex-shrink-0" />
                                                            )}
                                                        </div>
                                                        {repo.description && (
                                                            <p className="text-sm text-[#7a6f60] mt-1 truncate">
                                                                {repo.description}
                                                            </p>
                                                        )}
                                                        <div className="flex items-center gap-4 mt-2 text-xs text-[#a89d8e]">
                                                            {repo.language && (
                                                                <span className="flex items-center gap-1">
                                                                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                                                                    {repo.language}
                                                                </span>
                                                            )}
                                                            <span className="flex items-center gap-1">
                                                                <GitBranch className="w-3 h-3" />
                                                                {repo.defaultBranch}
                                                            </span>
                                                            <span>Updated {formatDate(repo.lastPushed)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
