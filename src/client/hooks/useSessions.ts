import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api.js';
import type { CreateSessionRequest, ImageAttachment } from '../../shared/types.js';

export function useSessions() {
  return useQuery({
    queryKey: ['sessions', 'tracked'],
    queryFn: api.getTrackedSessions,
    refetchInterval: 5000,
  });
}

export function useAllSessions() {
  return useQuery({
    queryKey: ['sessions', 'all'],
    queryFn: api.getAllSessions,
    refetchInterval: 5000,
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSessionRequest) => api.createSession(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

export function useUntrackSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.untrackSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

export function useTrackSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.trackSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

export function useSendPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, prompt, images }: { id: string; prompt: string; images?: ImageAttachment[] }) => api.sendPrompt(id, prompt, images),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['session-history', variables.id] });
    },
  });
}

export function useSessionHistory(sessionId: string | null) {
  return useQuery({
    queryKey: ['session-history', sessionId],
    queryFn: () => api.getSessionHistory(sessionId!).then(r => r.messages),
    enabled: !!sessionId,
    staleTime: Infinity,
  });
}
