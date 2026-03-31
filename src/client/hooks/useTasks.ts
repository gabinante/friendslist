import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api.js';
import type { CreateTaskRequest, TaskPhase } from '../../shared/types.js';

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.getTasks(),
    refetchInterval: 5000,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTaskRequest) => api.createTask(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; phase?: TaskPhase; title?: string; description?: string }) =>
      api.updateTask(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useAssignTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, sessionId }: { taskId: string; sessionId: string | null }) =>
      api.assignTask(taskId, sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
