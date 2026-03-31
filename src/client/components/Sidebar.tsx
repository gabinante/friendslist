import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SessionInfo } from '../../shared/types.js';
import { useCreateSession, useDeleteSession } from '../hooks/useSessions.js';
import * as api from '../lib/api.js';
import type { DirEntry } from '../lib/api.js';

const STATUS_COLORS: Record<string, string> = {
  idle: 'bg-gray-400',
  working: 'bg-green-400 animate-pulse',
  waiting_input: 'bg-yellow-400',
  error: 'bg-red-400',
  loop: 'bg-blue-400 animate-pulse',
  stopped: 'bg-gray-600',
};

interface SidebarProps {
  sessions: SessionInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  activeView: string;
  onViewChange: (view: string) => void;
}

function DirectoryPicker({ value, onChange }: { value: string; onChange: (path: string) => void }) {
  const [mode, setMode] = useState<'repos' | 'browse'>('repos');
  const [browsePath, setBrowsePath] = useState<string | undefined>(undefined);

  const { data: repos = [] } = useQuery({
    queryKey: ['repos'],
    queryFn: api.getRepos,
    staleTime: 30000,
  });

  const { data: browseResult } = useQuery({
    queryKey: ['browse', browsePath],
    queryFn: () => api.browseDirs(browsePath),
    enabled: mode === 'browse',
  });

  const handleSelect = (path: string) => {
    onChange(path);
  };

  const handleBrowseInto = (path: string) => {
    setBrowsePath(path);
  };

  return (
    <div className="space-y-1">
      {/* Mode toggle */}
      <div className="flex gap-1 text-xs">
        <button
          onClick={() => setMode('repos')}
          className={`px-2 py-0.5 rounded ${mode === 'repos' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
        >
          Git Repos
        </button>
        <button
          onClick={() => setMode('browse')}
          className={`px-2 py-0.5 rounded ${mode === 'browse' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
        >
          Browse
        </button>
      </div>

      {/* Selected path display */}
      {value && (
        <div className="text-xs text-blue-400 bg-gray-800 px-2 py-1 rounded truncate">
          {value}
        </div>
      )}

      {/* Repo list */}
      {mode === 'repos' && (
        <div className="max-h-40 overflow-y-auto scrollbar-thin bg-gray-800 rounded border border-gray-700">
          {repos.length === 0 ? (
            <div className="text-xs text-gray-600 px-2 py-2 text-center">No repos found</div>
          ) : (
            repos.map((repo: DirEntry) => (
              <button
                key={repo.path}
                onClick={() => handleSelect(repo.path)}
                className={`w-full text-left px-2 py-1.5 text-xs hover:bg-gray-700 flex items-center gap-1.5 ${
                  value === repo.path ? 'bg-gray-700 text-white' : 'text-gray-300'
                }`}
              >
                <span className="text-yellow-500 flex-shrink-0">*</span>
                <span className="truncate">{repo.name}</span>
                <span className="text-gray-600 truncate ml-auto text-[10px]">{repo.path}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Browse view */}
      {mode === 'browse' && browseResult && (
        <div className="max-h-40 overflow-y-auto scrollbar-thin bg-gray-800 rounded border border-gray-700">
          {/* Current path + parent nav */}
          <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-700 text-xs text-gray-500">
            <button
              onClick={() => setBrowsePath(browseResult.parent)}
              className="text-gray-400 hover:text-white"
            >
              ..
            </button>
            <span className="truncate">{browseResult.path}</span>
            <button
              onClick={() => handleSelect(browseResult.path)}
              className="ml-auto text-blue-400 hover:text-blue-300 flex-shrink-0"
            >
              select
            </button>
          </div>
          {browseResult.entries.map((entry: DirEntry) => (
            <div
              key={entry.path}
              className="flex items-center px-2 py-1.5 text-xs hover:bg-gray-700"
            >
              <button
                onClick={() => handleBrowseInto(entry.path)}
                className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
              >
                <span className={entry.isGitRepo ? 'text-yellow-500' : 'text-gray-500'}>
                  {entry.isGitRepo ? '*' : '/'}
                </span>
                <span className="text-gray-300 truncate">{entry.name}</span>
              </button>
              <button
                onClick={() => handleSelect(entry.path)}
                className="text-blue-400 hover:text-blue-300 ml-2 flex-shrink-0"
              >
                select
              </button>
            </div>
          ))}
          {browseResult.entries.length === 0 && (
            <div className="text-xs text-gray-600 px-2 py-2 text-center">Empty directory</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ sessions, selectedId, onSelect, activeView, onViewChange }: SidebarProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [cwd, setCwd] = useState('');
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();

  // Auto-populate name from directory selection
  useEffect(() => {
    if (cwd && !name) {
      const dirName = cwd.split('/').pop() ?? '';
      setName(dirName);
    }
  }, [cwd]);

  const handleCreate = () => {
    if (!name || !cwd) return;
    createSession.mutate({ name, alias: alias || undefined, cwd }, {
      onSuccess: () => {
        setShowCreate(false);
        setName('');
        setAlias('');
        setCwd('');
      },
    });
  };

  return (
    <div className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold text-white">friendlist</h1>
        <p className="text-xs text-gray-500 mt-1">claude code control plane</p>
      </div>

      {/* Navigation */}
      <nav className="p-2 border-b border-gray-800 space-y-1">
        {['sessions', 'tasks', 'gossip', 'flows'].map((view) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            className={`w-full text-left px-3 py-1.5 rounded text-sm capitalize ${
              activeView === view ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {view}
          </button>
        ))}
      </nav>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
        {sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onSelect(session.id)}
            className={`p-2 rounded cursor-pointer group ${
              selectedId === session.id ? 'bg-gray-700' : 'hover:bg-gray-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[session.status]}`} />
                <span className="text-sm text-white truncate">{session.name}</span>
                {session.alias && (
                  <span className="text-xs text-gray-500">({session.alias})</span>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteSession.mutate(session.id); }}
                className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs"
              >
                x
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-1 truncate">{session.cwd}</div>
          </div>
        ))}
      </div>

      {/* Create session */}
      <div className="p-2 border-t border-gray-800">
        {showCreate ? (
          <div className="space-y-2">
            <DirectoryPicker value={cwd} onChange={setCwd} />
            <input
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-800 text-sm text-white px-2 py-1 rounded border border-gray-700 focus:border-blue-500 outline-none"
            />
            <input
              placeholder="Alias (optional)"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="w-full bg-gray-800 text-sm text-white px-2 py-1 rounded border border-gray-700 focus:border-blue-500 outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!name || !cwd}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm py-1 rounded"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm py-1 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm py-2 rounded"
          >
            + New Session
          </button>
        )}
      </div>
    </div>
  );
}
