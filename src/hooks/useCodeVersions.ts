'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { CodeVersion } from '@/lib/supabase/types';
import { revertChanges } from '@/lib/n8n/client';

interface UseCodeVersionsOptions {
    clientId: string;
    sessionId?: string | null;
}

export function useCodeVersions({ clientId, sessionId }: UseCodeVersionsOptions) {
    const [versions, setVersions] = useState<CodeVersion[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isReverting, setIsReverting] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    // Fetch versions for the client/session
    const fetchVersions = useCallback(async () => {
        try {
            setIsLoading(true);

            let query = supabase
                .from('code_versions')
                .select('*')
                .eq('client_id', clientId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (sessionId) {
                query = query.eq('session_id', sessionId);
            }

            const { data, error } = await query;

            if (error) throw error;
            setVersions(data || []);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to fetch versions'));
        } finally {
            setIsLoading(false);
        }
    }, [clientId, sessionId]);

    // Revert to a specific version
    const revertToVersion = useCallback(async (versionId: string) => {
        try {
            setIsReverting(true);
            setError(null);

            const result = await revertChanges({
                client_id: clientId,
                version_id: versionId,
            });

            if (result.success) {
                // Refresh versions list (revert status handled by n8n workflow)
                await fetchVersions();
            }

            return result;
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to revert'));
            return { success: false, message: 'Revert failed' };
        } finally {
            setIsReverting(false);
        }
    }, [clientId, fetchVersions]);

    // Initial fetch
    useEffect(() => {
        if (clientId) {
            fetchVersions();
        }
    }, [clientId, sessionId, fetchVersions]);

    // Get versions grouped by file
    const versionsByFile = versions.reduce((acc, version) => {
        if (!acc[version.file_path]) {
            acc[version.file_path] = [];
        }
        acc[version.file_path].push(version);
        return acc;
    }, {} as Record<string, CodeVersion[]>);

    // Get the latest version for each file
    const latestVersions = Object.entries(versionsByFile).map(([path, fileVersions]) => ({
        file_path: path,
        latest: fileVersions[0],
        count: fileVersions.length,
    }));

    return {
        versions,
        versionsByFile,
        latestVersions,
        isLoading,
        isReverting,
        error,
        revertToVersion,
        refetch: fetchVersions,
    };
}
