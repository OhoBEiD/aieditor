import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";

export interface SupabaseSchema {
  tables: Array<{
    name: string;
    columns: Array<{ name: string; type: string; is_nullable: boolean }>;
  }>;
}

export interface SupabaseProject {
  id: string;
  name: string;
  ref: string;
  region: string;
  status: string;
  url: string;
}

export interface SupabaseConnectionState {
  isConnected: boolean;
  projectUrl: string | null;
  anonKey: string | null;
  hasServiceRoleKey: boolean;
  schema: SupabaseSchema | null;
  isLoading: boolean;
  error: string | null;
  // OAuth state
  isAuthenticated: boolean;
  projects: SupabaseProject[];
  isLoadingProjects: boolean;
}

const INITIAL_STATE: SupabaseConnectionState = {
  isConnected: false,
  projectUrl: null,
  anonKey: null,
  hasServiceRoleKey: false,
  schema: null,
  isLoading: false,
  error: null,
  isAuthenticated: false,
  projects: [],
  isLoadingProjects: false,
};

export function useSupabaseConnection(projectId: string | undefined) {
  const [state, setState] = useState<SupabaseConnectionState>(INITIAL_STATE);
  const [userId, setUserId] = useState<string | null>(null);
  const oauthListenerRef = useRef(false);

  // Get current user ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  // Fetch existing connection on mount
  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true }));

    fetch(`/api/supabase-connection?siteId=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.connected) {
          setState((s) => ({
            ...s,
            isConnected: true,
            projectUrl: data.projectUrl,
            anonKey: data.anonKey,
            hasServiceRoleKey: data.hasServiceRoleKey,
            schema: data.schema,
            isLoading: false,
            error: null,
          }));
        } else {
          setState((s) => ({ ...s, isConnected: false, isLoading: false }));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState((s) => ({ ...s, isLoading: false, error: err.message }));
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Check if user has OAuth token + fetch projects
  const fetchProjects = useCallback(async () => {
    if (!userId) return;

    setState((s) => ({ ...s, isLoadingProjects: true }));

    try {
      const res = await fetch(`/api/supabase-connection/projects?userId=${userId}`);
      const data = await res.json();

      if (data.authenticated) {
        setState((s) => ({
          ...s,
          isAuthenticated: true,
          projects: data.projects || [],
          isLoadingProjects: false,
        }));
      } else {
        setState((s) => ({
          ...s,
          isAuthenticated: false,
          projects: [],
          isLoadingProjects: false,
        }));
      }
    } catch {
      setState((s) => ({ ...s, isLoadingProjects: false }));
    }
  }, [userId]);

  // Fetch projects when userId is available (and not already connected)
  useEffect(() => {
    if (userId && !state.isConnected) {
      fetchProjects();
    }
  }, [userId, state.isConnected, fetchProjects]);

  // Listen for OAuth popup completion
  useEffect(() => {
    if (oauthListenerRef.current) return;
    oauthListenerRef.current = true;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "supabase-oauth-complete") {
        // OAuth completed - refresh projects list
        fetchProjects();
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      oauthListenerRef.current = false;
    };
  }, [fetchProjects]);

  // Start OAuth flow (opens popup)
  const startOAuth = useCallback(() => {
    if (!projectId || !userId) return;
    const url = `/api/supabase-connection/oauth?siteId=${projectId}&userId=${userId}`;
    const popup = window.open(url, "supabase-oauth", "width=600,height=700,popup=yes");
    if (!popup) {
      // Popup blocked - redirect instead
      window.location.href = url;
    }
  }, [projectId, userId]);

  // Connect to a specific project (auto-fetch keys via Management API)
  const connectProject = useCallback(
    async (projectRef: string) => {
      if (!projectId || !userId) throw new Error("No project ID or user ID");

      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        const res = await fetch("/api/supabase-connection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId: projectId, projectRef, userId }),
        });

        const data = await res.json();

        if (!res.ok) {
          setState((s) => ({ ...s, isLoading: false, error: data.error }));
          throw new Error(data.error);
        }

        setState((s) => ({
          ...s,
          isConnected: true,
          projectUrl: data.projectUrl,
          anonKey: data.anonKey,
          hasServiceRoleKey: data.hasServiceRoleKey,
          schema: data.schema,
          isLoading: false,
          error: null,
        }));

        return data;
      } catch (err: any) {
        setState((s) => ({ ...s, isLoading: false, error: err.message }));
        throw err;
      }
    },
    [projectId, userId]
  );

  // Manual connect (fallback)
  const connect = useCallback(
    async (projectUrl: string, anonKey: string, serviceRoleKey?: string) => {
      if (!projectId) throw new Error("No project ID");

      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        const res = await fetch("/api/supabase-connection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId: projectId, projectUrl, anonKey, serviceRoleKey }),
        });

        const data = await res.json();

        if (!res.ok) {
          setState((s) => ({ ...s, isLoading: false, error: data.error }));
          throw new Error(data.error);
        }

        setState((s) => ({
          ...s,
          isConnected: true,
          projectUrl: data.projectUrl,
          anonKey: anonKey,
          hasServiceRoleKey: data.hasServiceRoleKey,
          schema: data.schema,
          isLoading: false,
          error: null,
        }));

        return data;
      } catch (err: any) {
        setState((s) => ({ ...s, isLoading: false, error: err.message }));
        throw err;
      }
    },
    [projectId]
  );

  const disconnect = useCallback(async () => {
    if (!projectId) return;

    setState((s) => ({ ...s, isLoading: true }));

    try {
      await fetch("/api/supabase-connection", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: projectId }),
      });
      setState((s) => ({
        ...INITIAL_STATE,
        isAuthenticated: s.isAuthenticated,
        projects: s.projects,
        isLoading: false,
      }));
    } catch (err: any) {
      setState((s) => ({ ...s, isLoading: false, error: err.message }));
    }
  }, [projectId]);

  const refreshSchema = useCallback(async () => {
    if (!projectId) return;

    setState((s) => ({ ...s, isLoading: true }));

    try {
      const res = await fetch("/api/supabase-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: projectId, refreshSchema: true }),
      });

      const data = await res.json();
      if (res.ok && data.schema) {
        setState((s) => ({ ...s, schema: data.schema, isLoading: false }));
      } else {
        setState((s) => ({ ...s, isLoading: false, error: data.error }));
      }
    } catch (err: any) {
      setState((s) => ({ ...s, isLoading: false, error: err.message }));
    }
  }, [projectId]);

  const runSQL = useCallback(
    async (sql: string): Promise<{ success: boolean; data?: any; error?: string }> => {
      if (!projectId) return { success: false, error: "No project ID" };

      try {
        const res = await fetch("/api/supabase-connection/sql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId: projectId, sql }),
        });

        const data = await res.json();
        return data;
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [projectId]
  );

  return {
    ...state,
    connect,
    connectProject,
    disconnect,
    refreshSchema,
    runSQL,
    startOAuth,
    fetchProjects,
  };
}
