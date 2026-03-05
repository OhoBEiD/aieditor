'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, RefreshCw, Database, ExternalLink, Unplug, CheckCircle2, LogIn, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import type { SupabaseConnectionState, SupabaseProject } from '@/hooks/useSupabaseConnection';

interface SupabaseDrawerProps {
    connection: SupabaseConnectionState;
    onStartOAuth: () => void;
    onConnectProject: (projectRef: string) => Promise<any>;
    onDisconnect: () => Promise<void>;
    onRefreshSchema: () => Promise<void>;
    onClose: () => void;
}

export function SupabaseDrawer({ connection, onStartOAuth, onConnectProject, onDisconnect, onRefreshSchema, onClose }: SupabaseDrawerProps) {
    const [connectingRef, setConnectingRef] = useState<string | null>(null);
    const [connectError, setConnectError] = useState<string | null>(null);

    const handleConnectProject = async (project: SupabaseProject) => {
        setConnectError(null);
        setConnectingRef(project.ref);
        try {
            await onConnectProject(project.ref);
            onClose();
        } catch (err: any) {
            setConnectError(err.message || 'Failed to connect');
        } finally {
            setConnectingRef(null);
        }
    };

    // ── State 3: Connected ──
    if (connection.isConnected) {
        const tables = connection.schema?.tables || [];
        return (
            <>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[#b69161]/10">
                    <Image src="/supabase-logo.png" alt="" width={20} height={20} className="object-contain shrink-0" />
                    <span className="font-semibold text-[#b69161]">Supabase</span>
                    <span className="ml-auto flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        Connected
                    </span>
                </div>
                <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                    <div className="px-2 py-1">
                        <p className="text-xs text-[#b69161]/50 truncate" title={connection.projectUrl || ''}>
                            {connection.projectUrl?.replace('https://', '')}
                        </p>
                    </div>

                    {tables.length > 0 && (
                        <div className="px-2">
                            <p className="text-xs font-semibold text-[#b69161]/60 mb-1.5">Tables ({tables.length})</p>
                            <div className="space-y-0.5">
                                {tables.map((t) => (
                                    <div key={t.name} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#d6cfc9]/30 text-xs text-[#b69161]/70">
                                        <Database className="w-3 h-3 text-[#b69161]/50 shrink-0" />
                                        <span className="truncate">{t.name}</span>
                                        <span className="ml-auto text-[#b69161]/40">{t.columns?.length || 0} cols</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {tables.length === 0 && !connection.isLoading && (
                        <p className="px-2 text-xs text-[#b69161]/40 italic">No tables found in public schema.</p>
                    )}

                    <div className="border-t border-[#b69161]/10 pt-2 space-y-1">
                        <button
                            onClick={onRefreshSchema}
                            disabled={connection.isLoading}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#d6cfc9]/30 transition-colors text-sm text-[#b69161]/70 disabled:opacity-50"
                        >
                            <RefreshCw className={cn("w-3.5 h-3.5", connection.isLoading && "animate-spin")} />
                            Refresh Schema
                        </button>
                        <a
                            href={connection.projectUrl || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#d6cfc9]/30 transition-colors text-sm text-[#b69161]/70"
                            onClick={onClose}
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Dashboard
                        </a>
                        <button
                            onClick={onDisconnect}
                            disabled={connection.isLoading}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors text-sm text-red-400 disabled:opacity-50"
                        >
                            <Unplug className="w-3.5 h-3.5" />
                            Disconnect
                        </button>
                    </div>
                </div>
            </>
        );
    }

    // ── State 2: Authenticated — pick a project ──
    if (connection.isAuthenticated) {
        return (
            <>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[#b69161]/10">
                    <Image src="/supabase-logo.png" alt="" width={20} height={20} className="object-contain shrink-0" />
                    <span className="font-semibold text-[#b69161]">Select Project</span>
                </div>
                <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                    {connection.isLoadingProjects ? (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 className="w-5 h-5 animate-spin text-[#b69161]/50" />
                            <span className="ml-2 text-sm text-[#b69161]/60">Loading projects...</span>
                        </div>
                    ) : connection.projects.length === 0 ? (
                        <div className="text-center py-6">
                            <p className="text-sm text-[#b69161]/60 mb-2">No projects found.</p>
                            <p className="text-xs text-[#b69161]/40">Create a project in Supabase first, then come back.</p>
                            <a
                                href="https://supabase.com/dashboard/projects"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-3 text-xs text-emerald-400 hover:underline"
                            >
                                <ExternalLink className="w-3 h-3" />
                                Open Supabase Dashboard
                            </a>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {connection.projects.map((project) => (
                                <button
                                    key={project.id}
                                    onClick={() => handleConnectProject(project)}
                                    disabled={connectingRef !== null}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left group",
                                        connectingRef === project.ref
                                            ? "bg-emerald-500/10 border border-emerald-500/30"
                                            : "hover:bg-[#d6cfc9]/30 border border-transparent"
                                    )}
                                >
                                    <Database className="w-4 h-4 text-[#b69161]/50 shrink-0 group-hover:text-emerald-400" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-[#b69161] truncate">{project.name}</p>
                                        <p className="text-xs text-[#b69161]/40 truncate">{project.region} &middot; {project.ref}</p>
                                    </div>
                                    {connectingRef === project.ref ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4 text-[#b69161]/30 group-hover:text-[#b69161]/60 shrink-0" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {connectError && (
                        <p className="text-xs text-red-400 px-1">{connectError}</p>
                    )}

                    {connection.error && !connectError && (
                        <p className="text-xs text-red-400 px-1">{connection.error}</p>
                    )}
                </div>
            </>
        );
    }

    // ── State 1: Not authenticated — connect via OAuth ──
    return (
        <>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#b69161]/10">
                <Image src="/supabase-logo.png" alt="" width={20} height={20} className="object-contain shrink-0" />
                <span className="font-semibold text-[#b69161]">Supabase</span>
            </div>
            <div className="p-4 space-y-4">
                <p className="text-sm text-[#b69161]/60 leading-relaxed">
                    Connect your Supabase project to enable database queries, table creation, and auth in your app.
                </p>

                <button
                    onClick={onStartOAuth}
                    disabled={connection.isLoading}
                    className={cn(
                        "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all",
                        connection.isLoading
                            ? "bg-[#d6cfc9]/20 text-[#b69161]/40 cursor-not-allowed"
                            : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm"
                    )}
                >
                    {connection.isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Connecting...
                        </>
                    ) : (
                        <>
                            <LogIn className="w-4 h-4" />
                            Connect to Supabase
                        </>
                    )}
                </button>

                {connection.error && (
                    <p className="text-xs text-red-400 text-center">{connection.error}</p>
                )}
            </div>
        </>
    );
}
