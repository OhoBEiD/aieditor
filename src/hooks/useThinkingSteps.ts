import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface ThinkingStep {
  id: string;
  request_id: string;
  conversation_id: string | null;
  site_id: string;
  step_number: number;
  tool_name: string | null;
  status: 'pending' | 'running' | 'complete' | 'error';
  message: string;
  details: any;
  created_at: string;
  updated_at: string;
}

interface UseThinkingStepsReturn {
  steps: ThinkingStep[];
  isSubscribed: boolean;
  clearSteps: () => void;
  refresh: (overrideRequestId?: string) => Promise<void>;
}

export function useThinkingSteps(requestId: string | null, sessionId?: string | null): UseThinkingStepsReturn {
  const [steps, setSteps] = useState<ThinkingStep[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const clearSteps = useCallback(() => {
    setSteps([]);
  }, []);

  const refresh = useCallback(async (overrideRequestId?: string) => {
    // We need at least one of these to fetch anything (check override first)
    const targetRequestId = overrideRequestId || requestId;

    if (!targetRequestId && !sessionId) {
      setSteps([]);
      return;
    }

    let query = supabase
      .from('thinking_steps')
      .select('*')
      .order('created_at', { ascending: true });

    if (targetRequestId) {
      query = query.eq('request_id', targetRequestId);
    } else if (sessionId) {
      query = query.eq('conversation_id', sessionId);
    }

    const { data, error } = await query;

    console.log('[useThinkingSteps] Refreshing for:', targetRequestId, 'Found:', data?.length);

    if (error) {
      console.error('Error fetching thinking steps:', error);
      return;
    }

    if (data) {
      setSteps(data);
    }
  }, [requestId, sessionId]);

  useEffect(() => {
    refresh();

    if (!requestId && !sessionId) {
      setIsSubscribed(false);
      return;
    }

    const filter = requestId
      ? `request_id=eq.${requestId}`
      : sessionId
        ? `conversation_id=eq.${sessionId}`
        : '';

    if (!filter) return;

    const channel = supabase
      .channel(`thinking-steps-${requestId || sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'thinking_steps',
          filter,
        },
        (payload) => {
          setSteps((prev) => [...prev, payload.new as ThinkingStep]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'thinking_steps',
          filter,
        },
        (payload) => {
          setSteps((prev) =>
            prev.map((step) =>
              step.id === payload.new.id ? (payload.new as ThinkingStep) : step
            )
          );
        }
      )
      .subscribe((status) => {
        setIsSubscribed(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
      setIsSubscribed(false);
    };
  }, [requestId, sessionId, refresh]);

  return { steps, isSubscribed, clearSteps, refresh };
}
