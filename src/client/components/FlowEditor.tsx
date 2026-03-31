import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api.js';

export default function FlowEditor() {
  const qc = useQueryClient();
  const { data: flows = [] } = useQuery({
    queryKey: ['flows'],
    queryFn: api.getFlows,
    refetchInterval: 5000,
  });

  const runFlow = useMutation({
    mutationFn: (id: string) => api.runFlow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flows'] }),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-white font-medium">Flows</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Define flows in <code className="text-gray-400">flows/*.flow.ts</code>
        </p>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
        {(flows as { id: string; name: string; status: string; steps: unknown[] }[]).length === 0 ? (
          <div className="text-gray-600 text-center mt-8 text-sm">
            <p>No flows defined yet.</p>
            <p className="mt-2 text-xs">Create a flow via POST /api/flows or use the DSL in flows/*.flow.ts</p>
          </div>
        ) : (
          (flows as { id: string; name: string; status: string; steps: unknown[] }[]).map((flow) => (
            <div key={flow.id} className="bg-gray-900 rounded p-4 border border-gray-800">
              <div className="flex items-center justify-between">
                <h3 className="text-sm text-white font-medium">{flow.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  flow.status === 'completed' ? 'bg-green-900 text-green-300' :
                  flow.status === 'running' ? 'bg-blue-900 text-blue-300' :
                  flow.status === 'failed' ? 'bg-red-900 text-red-300' :
                  'bg-gray-800 text-gray-400'
                }`}>
                  {flow.status}
                </span>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                {(flow.steps as { sessionAlias: string }[]).map((s, i) => (
                  <span key={i}>
                    {i > 0 && <span className="mx-1">&rarr;</span>}
                    <span className="text-gray-400">{s.sessionAlias}</span>
                  </span>
                ))}
              </div>
              {flow.status === 'draft' && (
                <button
                  onClick={() => runFlow.mutate(flow.id)}
                  className="mt-3 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded"
                >
                  Run Flow
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
