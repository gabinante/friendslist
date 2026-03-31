import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api.js';

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: api.getTags,
    refetchInterval: 10000,
  });
}

export function useTagAssignments() {
  return useQuery({
    queryKey: ['tagAssignments'],
    queryFn: api.getTagAssignments,
    refetchInterval: 10000,
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string }) => api.createTag(name, color),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      qc.invalidateQueries({ queryKey: ['tagAssignments'] });
    },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTag(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      qc.invalidateQueries({ queryKey: ['tagAssignments'] });
    },
  });
}

export function useAssignTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tagId, sessionId }: { tagId: string; sessionId: string }) =>
      api.assignTag(tagId, sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tagAssignments'] }),
  });
}

export function useRemoveTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tagId, sessionId }: { tagId: string; sessionId: string }) =>
      api.removeTag(tagId, sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tagAssignments'] }),
  });
}
