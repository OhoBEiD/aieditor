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
}

export function useThinkingSteps(requestId: string | null): UseThinkingStepsReturn {
  const [steps, setSteps] = useState<ThinkingStep[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const clearSteps = useCallback(() => {
    setSteps([]);
  }, []);

  useEffect(() => {
    if (!requestId) {
      setSteps([]);
      setIsSubscribed(false);
      return;
    }

    // Fetch existing steps for this request
    const fetchExistingSteps = async () => {
      const { data, error } = await supabase
        .from('thinking_steps')
        .select('*')
        .eq('request_id', requestId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching thinking steps:', error);
        return;
      }

      if (data) {
        setSteps(data);
      }
    };

    fetchExistingSteps();

    // Subscribe to new thinking steps for this request
    const channel = supabase
      .channel(`thinking-steps-${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'thinking_steps',
          filter: `request_id=eq.${requestId}`,
        },
        (payload) => {
          console.log('New thinking step:', payload.new);
          setSteps((prev) => [...prev, payload.new as ThinkingStep]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'thinking_steps',
          filter: `request_id=eq.${requestId}`,
        },
        (payload) => {
          console.log('Updated thinking step:', payload.new);
          setSteps((prev) =>
            prev.map((step) =>
              step.id === payload.new.id ? (payload.new as ThinkingStep) : step
            )
          );
        }
      )
      .subscribe((status) => {
        console.log('Thinking steps subscription status:', status);
        setIsSubscribed(status === 'SUBSCRIBED');
      });

    // Cleanup subscription on unmount or when requestId changes
    return () => {
      console.log('Unsubscribing from thinking steps');
      supabase.removeChannel(channel);
      setIsSubscribed(false);
    };
  }, [requestId]);

  return { steps, isSubscribed, clearSteps };
}
