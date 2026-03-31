import React, { useState } from 'react';
import { useMCPServers, useToolCatalog, useToolUsage } from '../hooks/useTools.js';
import { useSessions } from '../hooks/useSessions.js';

export default function ToolsPane() {
  const { data: servers = [] } = useMCPServers();
  const { data: catalog = [] } = useToolCatalog();
  const { data: sessions = [] } = useSessions();
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>();
  const { data: usage } = useToolUsage(selectedSessionId);
  const [expandedServer, setExpandedServer] = useState<string | null>('friendlist');
  const [showCatalog, setShowCatalog] = useState(false);

  // Sort usage by count descending
  const sortedUsage = usage
    ? Object.entries(usage.aggregate).sort(([, a], [, b]) => b - a)
    : [];
  const maxCount = sortedUsage.length > 0 ? sortedUsage[0][1] : 0;

  // Group catalog by source
  const catalogBySource = catalog.reduce<Record<string, typeof catalog>>((acc, tool) => {
    (acc[tool.source] ??= []).push(tool);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-white font-medium">Tools & MCP Servers</h2>
        <p className="text-xs text-gray-500 mt-0.5">Tool availability and usage across sessions</p>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-6">
        {/* MCP Servers */}
        <section>
          <h3 className="text-sm font-medium text-gray-300 mb-2">MCP Servers</h3>
          <div className="space-y-2">
            {servers.map(server => {
              const isExpanded = expandedServer === server.name;
              return (
                <div key={server.name} className="bg-gray-800 rounded border border-gray-700">
                  <button
                    onClick={() => setExpandedServer(isExpanded ? null : server.name)}
                    className="w-full px-3 py-2 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${server.source === 'friendlist' ? 'bg-blue-400' : 'bg-gray-400'}`} />
                      <span className="text-sm text-white font-medium">{server.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{server.transport}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{server.tools.length} tools</span>
                      <span className="text-gray-500 text-xs">{isExpanded ? 'v' : '>'}</span>
                    </div>
                  </button>
                  {isExpanded && server.tools.length > 0 && (
                    <div className="border-t border-gray-700 px-3 py-2 space-y-1.5">
                      {server.command && (
                        <div className="text-xs text-gray-600 font-mono mb-2">{server.command}</div>
                      )}
                      {server.tools.map(tool => (
                        <div key={tool.name} className="flex gap-2 text-xs">
                          <span className="text-blue-300 font-mono flex-shrink-0">{tool.name}</span>
                          <span className="text-gray-500 truncate">{tool.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {servers.length === 0 && (
              <div className="text-sm text-gray-600 text-center py-4">No MCP servers configured</div>
            )}
          </div>
        </section>

        {/* Tool Catalog (collapsible) */}
        <section>
          <button
            onClick={() => setShowCatalog(!showCatalog)}
            className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2"
          >
            <span className="text-gray-500 text-xs">{showCatalog ? 'v' : '>'}</span>
            Tool Catalog
            <span className="text-xs text-gray-600">({catalog.length} tools)</span>
          </button>
          {showCatalog && (
            <div className="space-y-3">
              {Object.entries(catalogBySource).map(([source, tools]) => (
                <div key={source}>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{source}</div>
                  <div className="bg-gray-800 rounded border border-gray-700 divide-y divide-gray-700">
                    {tools.map(tool => (
                      <div key={tool.name} className="px-3 py-1.5 flex gap-2 text-xs">
                        <span className="text-gray-200 font-mono flex-shrink-0">{tool.name}</span>
                        <span className="text-gray-500 truncate">{tool.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Tool Usage */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-300">Tool Usage</h3>
            <select
              value={selectedSessionId ?? ''}
              onChange={(e) => setSelectedSessionId(e.target.value || undefined)}
              className="bg-gray-800 text-xs text-gray-300 px-2 py-1 rounded border border-gray-700 outline-none"
            >
              <option value="">All sessions</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>{s.alias || s.name}</option>
              ))}
            </select>
          </div>

          {sortedUsage.length > 0 ? (
            <div className="space-y-1.5">
              {sortedUsage.map(([tool, count]) => (
                <div key={tool} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-300 font-mono w-40 truncate flex-shrink-0">{tool}</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${Math.max((count / maxCount) * 100, 2)}%` }}
                    />
                  </div>
                  <span className="text-gray-500 w-10 text-right flex-shrink-0">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-600 text-center py-4">No tool usage data available</div>
          )}

          {/* Per-session breakdown */}
          {usage && usage.bySession.length > 1 && !selectedSessionId && (
            <div className="mt-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">By Session</div>
              <div className="space-y-2">
                {usage.bySession
                  .sort((a, b) => Object.values(b.usage).reduce((s, n) => s + n, 0) - Object.values(a.usage).reduce((s, n) => s + n, 0))
                  .slice(0, 10)
                  .map(({ sessionId, sessionName, usage: sessionUsage }) => {
                    const total = Object.values(sessionUsage).reduce((s, n) => s + n, 0);
                    const topTools = Object.entries(sessionUsage)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 5);
                    return (
                      <div key={sessionId} className="bg-gray-800 rounded border border-gray-700 px-3 py-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-white">{sessionName}</span>
                          <span className="text-xs text-gray-500">{total} calls</span>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {topTools.map(([name, count]) => (
                            <span key={name} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                              {name} ({count})
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
