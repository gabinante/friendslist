import { useQuery } from '@tanstack/react-query';
import * as api from '../lib/api.js';

export function useMCPServers() {
  return useQuery({
    queryKey: ['mcp-servers'],
    queryFn: api.getMCPServers,
    staleTime: 60000,
  });
}

export function useToolCatalog() {
  return useQuery({
    queryKey: ['tool-catalog'],
    queryFn: api.getToolCatalog,
    staleTime: 60000,
  });
}

export function useToolUsage(sessionId?: string) {
  return useQuery({
    queryKey: ['tool-usage', sessionId],
    queryFn: () => api.getToolUsage(sessionId),
    refetchInterval: 10000,
  });
}
