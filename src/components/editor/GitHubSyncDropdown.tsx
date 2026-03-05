'use client';

import { useState, useEffect } from 'react';
import { Github, Loader2, ExternalLink, Download, Lock, Globe, Check, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';

interface GitHubSyncDropdownProps {
    projectId: string | undefined;
    repoUrl?: string;
    onSyncComplete?: (repoUrl: string) => void;
    onClose: () => void;
    onDownloadZip?: () => void;
}

type GitHubStatus = 'loading' | 'not_signed_in' | 'no_github' | 'create_repo' | 'linked' | 'syncing' | 'success' | 'error';

export function GitHubSyncDropdown({
    projectId,
    repoUrl,
    onSyncComplete,
    onClose,
    onDownloadZip,
}: GitHubSyncDropdownProps) {
    const { isAuthenticated, user, signInWithGitHub, session } = useAuth();

    const [status, setStatus] = useState<GitHubStatus>('loading');
    const [githubUsername, setGithubUsername] = useState<string | null>(null);
    const [repoName, setRepoName] = useState('');
    const [isPrivate, setIsPrivate] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [createdRepoUrl, setCreatedRepoUrl] = useState<string | null>(null);

    useEffect(() => {
        checkStatus();
    }, [isAuthenticated, user, repoUrl]);

    async function checkStatus() {
        if (!isAuthenticated || !user) {
            setStatus('not_signed_in');
            return;
        }

        if (repoUrl) {
            setStatus('linked');
            return;
        }

        // Check if GitHub token exists
        try {
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (!currentSession) {
                setStatus('not_signed_in');
                return;
            }

            const res = await fetch('/api/github/token', {
                headers: { 'Authorization': `Bearer ${currentSession.access_token}` },
            });
            const data = await res.json();

            if (data.connected) {
                setGithubUsername(data.username);
                setRepoName(projectId ? `automate-${projectId.slice(0, 8)}` : `automate-project-${Date.now()}`);
                setStatus('create_repo');
            } else if (user?.user_metadata?.user_name) {
                // Has GitHub provider but token may be expired
                setGithubUsername(user.user_metadata.user_name);
                setStatus(data.expired ? 'no_github' : 'no_github');
            } else {
                setStatus('no_github');
            }
        } catch {
            setStatus('no_github');
        }
    }

    async function handleCreateAndSync() {
        if (!projectId || !repoName.trim()) return;

        setStatus('syncing');
        setError(null);

        try {
            const { data: { session: currentSession } } = await supabase.auth.getSession();

            const res = await fetch('/api/projects/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(currentSession ? { 'Authorization': `Bearer ${currentSession.access_token}` } : {}),
                },
                body: JSON.stringify({
                    projectId,
                    repoName: repoName.trim(),
                    isPrivate,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Sync failed');
            }

            const data = await res.json();
            setCreatedRepoUrl(data.repoUrl);
            setStatus('success');
            onSyncComplete?.(data.repoUrl);
        } catch (err: any) {
            setError(err.message || 'Failed to sync');
            setStatus('error');
        }
    }

    return (
        <div className="min-w-[280px]">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#b69161]/10">
                <Github className="w-5 h-5 text-[#b69161]" />
                <span className="font-semibold text-[#b69161]">GitHub</span>
                {status === 'linked' && (
                    <span className="ml-auto text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        Connected
                    </span>
                )}
                {status === 'success' && (
                    <span className="ml-auto text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        Synced
                    </span>
                )}
            </div>

            <div className="p-3">
                {/* Loading */}
                {status === 'loading' && (
                    <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-5 h-5 animate-spin text-[#b69161]/50" />
                    </div>
                )}

                {/* Not signed in */}
                {status === 'not_signed_in' && (
                    <div className="text-center py-4">
                        <div className="w-10 h-10 rounded-full bg-[#b69161]/10 flex items-center justify-center mx-auto mb-3">
                            <Github className="w-5 h-5 text-[#b69161]/50" />
                        </div>
                        <p className="text-sm font-medium text-[#2c2418] mb-1">Sign in required</p>
                        <p className="text-xs text-[#84745b] mb-4">
                            Sign in to sync your project to GitHub
                        </p>
                        <button
                            onClick={() => signInWithGitHub()}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#2c2418] text-white text-sm font-medium hover:bg-[#3d3425] transition-colors"
                        >
                            <Github className="w-4 h-4" />
                            Sign in with GitHub
                        </button>
                    </div>
                )}

                {/* GitHub not connected */}
                {status === 'no_github' && (
                    <div className="text-center py-4">
                        <div className="w-10 h-10 rounded-full bg-[#b69161]/10 flex items-center justify-center mx-auto mb-3">
                            <Github className="w-5 h-5 text-[#b69161]/50" />
                        </div>
                        <p className="text-sm font-medium text-[#2c2418] mb-1">Connect GitHub</p>
                        <p className="text-xs text-[#84745b] mb-4">
                            Grant access to create and sync repositories
                        </p>
                        <button
                            onClick={() => signInWithGitHub()}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#2c2418] text-white text-sm font-medium hover:bg-[#3d3425] transition-colors"
                        >
                            <Github className="w-4 h-4" />
                            Connect GitHub
                        </button>
                    </div>
                )}

                {/* Create new repo form */}
                {status === 'create_repo' && (
                    <div className="space-y-3">
                        {githubUsername && (
                            <p className="text-xs text-[#84745b]">
                                Signed in as <span className="font-medium text-[#2c2418]">@{githubUsername}</span>
                            </p>
                        )}
                        <div>
                            <label className="text-xs font-medium text-[#84745b] mb-1 block">Repository name</label>
                            <input
                                type="text"
                                value={repoName}
                                onChange={(e) => setRepoName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, '-'))}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-[#b69161]/20 bg-white text-[#2c2418] focus:outline-none focus:ring-1 focus:ring-[#b69161]/40 focus:border-[#b69161]/40"
                                placeholder="my-project"
                            />
                        </div>
                        <button
                            onClick={() => setIsPrivate(!isPrivate)}
                            className="flex items-center gap-2 text-xs text-[#84745b] hover:text-[#2c2418] transition-colors"
                        >
                            {isPrivate ? (
                                <Lock className="w-3.5 h-3.5" />
                            ) : (
                                <Globe className="w-3.5 h-3.5" />
                            )}
                            {isPrivate ? 'Private repository' : 'Public repository'}
                        </button>
                        <button
                            onClick={handleCreateAndSync}
                            disabled={!repoName.trim()}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#2c2418] text-white text-sm font-medium hover:bg-[#3d3425] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Github className="w-4 h-4" />
                            Create & Sync
                        </button>
                    </div>
                )}

                {/* Syncing */}
                {status === 'syncing' && (
                    <div className="flex flex-col items-center py-6">
                        <Loader2 className="w-6 h-6 animate-spin text-[#b69161] mb-3" />
                        <p className="text-sm text-[#84745b]">Creating repo & syncing...</p>
                    </div>
                )}

                {/* Success */}
                {status === 'success' && createdRepoUrl && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg">
                            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                            <p className="text-xs text-emerald-700">Repository created and synced!</p>
                        </div>
                        <a
                            href={createdRepoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#d6cfc9]/30 transition-colors group"
                            onClick={() => onClose()}
                        >
                            <ExternalLink className="w-4 h-4 text-[#b69161]/60 group-hover:text-[#b69161]" />
                            <span className="text-sm font-medium text-[#b69161]/70 group-hover:text-[#b69161]">
                                View Repository
                            </span>
                        </a>
                    </div>
                )}

                {/* Error */}
                {status === 'error' && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
                            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                            <p className="text-xs text-red-600">{error || 'Sync failed'}</p>
                        </div>
                        <button
                            onClick={() => setStatus('create_repo')}
                            className="w-full text-sm text-[#b69161] hover:text-[#2c2418] transition-colors"
                        >
                            Try again
                        </button>
                    </div>
                )}

                {/* Linked repo */}
                {status === 'linked' && repoUrl && (
                    <div className="space-y-1">
                        <a
                            href={repoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#d6cfc9]/30 transition-colors group"
                            onClick={() => onClose()}
                        >
                            <ExternalLink className="w-4 h-4 text-[#b69161]/60 group-hover:text-[#b69161]" />
                            <span className="text-sm font-medium text-[#b69161]/70 group-hover:text-[#b69161]">
                                View Repository
                            </span>
                        </a>
                        {onDownloadZip && (
                            <button
                                onClick={() => { onDownloadZip(); onClose(); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#d6cfc9]/30 transition-colors group"
                            >
                                <Download className="w-4 h-4 text-[#b69161]/60 group-hover:text-[#b69161]" />
                                <span className="text-sm font-medium text-[#b69161]/70 group-hover:text-[#b69161]">
                                    Download ZIP
                                </span>
                            </button>
                        )}
                        <button
                            onClick={() => setStatus('create_repo')}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#d6cfc9]/30 transition-colors group"
                        >
                            <Github className="w-4 h-4 text-[#b69161]/60 group-hover:text-[#b69161]" />
                            <span className="text-sm font-medium text-[#b69161]/70 group-hover:text-[#b69161]">
                                Re-sync to GitHub
                            </span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
