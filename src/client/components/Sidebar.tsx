import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SessionInfo } from '../../shared/types.js';
import { useCreateSession, useUntrackSession } from '../hooks/useSessions.js';
import { useTags, useTagAssignments, useCreateTag, useAssignTag, useRemoveTag } from '../hooks/useTags.js';
import * as api from '../lib/api.js';
import type { DirEntry, TagInfo } from '../lib/api.js';

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

// ---------- Context Menu ----------
interface ContextMenuState {
  x: number;
  y: number;
  sessionId: string;
}

function ContextMenu({
  state,
  tags,
  sessionTagIds,
  onClose,
  onAddTag,
  onCreateTag,
  onRemoveTag,
}: {
  state: ContextMenuState;
  tags: TagInfo[];
  sessionTagIds: Set<string>;
  onClose: () => void;
  onAddTag: (tagId: string) => void;
  onCreateTag: () => void;
  onRemoveTag: (tagId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showSub, setShowSub] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const assignedTags = tags.filter(t => sessionTagIds.has(t.id));
  const unassignedTags = tags.filter(t => !sessionTagIds.has(t.id));

  return (
    <div
      ref={ref}
      data-testid="context-menu"
      className="fixed z-50 bg-gray-800 border border-gray-700 rounded shadow-xl text-sm min-w-[180px]"
      style={{ left: state.x, top: state.y }}
    >
      {/* Add Tag submenu */}
      <div
        className="relative"
        onMouseEnter={() => setShowSub(true)}
        onMouseLeave={() => setShowSub(false)}
      >
        <button className="w-full text-left px-3 py-2 text-gray-300 hover:bg-gray-700 flex items-center justify-between">
          Add Tag
          <span className="text-gray-500 text-xs ml-2">{'>'}</span>
        </button>
        {showSub && (
          <div className="absolute left-full top-0 bg-gray-800 border border-gray-700 rounded shadow-xl min-w-[160px]">
            {unassignedTags.map(tag => (
              <button
                key={tag.id}
                onClick={() => { onAddTag(tag.id); onClose(); }}
                className="w-full text-left px-3 py-1.5 text-gray-300 hover:bg-gray-700 flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </button>
            ))}
            <button
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={() => { onCreateTag(); onClose(); }}
              className="w-full text-left px-3 py-1.5 text-blue-400 hover:bg-gray-700 border-t border-gray-700"
            >
              + New Tag...
            </button>
          </div>
        )}
      </div>

      {/* Remove tags */}
      {assignedTags.length > 0 && (
        <>
          <div className="border-t border-gray-700" />
          {assignedTags.map(tag => (
            <button
              key={tag.id}
              onClick={() => { onRemoveTag(tag.id); onClose(); }}
              className="w-full text-left px-3 py-2 text-gray-400 hover:bg-gray-700 flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
              Remove "{tag.name}"
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// ---------- Directory Picker (unchanged) ----------
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

  return (
    <div className="space-y-1">
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

      {value && (
        <div className="text-xs text-blue-400 bg-gray-800 px-2 py-1 rounded truncate">{value}</div>
      )}

      {mode === 'repos' && (
        <div className="max-h-40 overflow-y-auto scrollbar-thin bg-gray-800 rounded border border-gray-700">
          {repos.length === 0 ? (
            <div className="text-xs text-gray-600 px-2 py-2 text-center">No repos found</div>
          ) : (
            repos.map((repo: DirEntry) => (
              <button
                key={repo.path}
                onClick={() => onChange(repo.path)}
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

      {mode === 'browse' && browseResult && (
        <div className="max-h-40 overflow-y-auto scrollbar-thin bg-gray-800 rounded border border-gray-700">
          <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-700 text-xs text-gray-500">
            <button onClick={() => setBrowsePath(browseResult.parent)} className="text-gray-400 hover:text-white">..</button>
            <span className="truncate">{browseResult.path}</span>
            <button onClick={() => onChange(browseResult.path)} className="ml-auto text-blue-400 hover:text-blue-300 flex-shrink-0">select</button>
          </div>
          {browseResult.entries.map((entry: DirEntry) => (
            <div key={entry.path} className="flex items-center px-2 py-1.5 text-xs hover:bg-gray-700">
              <button onClick={() => setBrowsePath(entry.path)} className="flex items-center gap-1.5 min-w-0 flex-1 text-left">
                <span className={entry.isGitRepo ? 'text-yellow-500' : 'text-gray-500'}>{entry.isGitRepo ? '*' : '/'}</span>
                <span className="text-gray-300 truncate">{entry.name}</span>
              </button>
              <button onClick={() => onChange(entry.path)} className="text-blue-400 hover:text-blue-300 ml-2 flex-shrink-0">select</button>
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

// ---------- Session Item ----------
function SessionItem({
  session,
  isSelected,
  sessionTags,
  onSelect,
  onDelete,
  onContextMenu,
}: {
  session: SessionInfo;
  isSelected: boolean;
  sessionTags: TagInfo[];
  onSelect: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`p-2 rounded cursor-pointer group ${isSelected ? 'bg-gray-700' : 'hover:bg-gray-800'}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[session.status]}`} />
          <span className="text-sm text-white truncate">{session.alias || session.name}</span>
          {session.alias && <span className="text-xs text-gray-500">({session.name})</span>}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs"
        >
          x
        </button>
      </div>
      <div className="text-xs text-gray-500 mt-1 truncate">{session.cwd}</div>
      {sessionTags.length > 0 && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {sessionTags.map(tag => (
            <span
              key={tag.id}
              data-testid="session-tag"
              className="text-[10px] px-1.5 py-0.5 rounded-full text-white"
              style={{ backgroundColor: tag.color + '40', color: tag.color, border: `1px solid ${tag.color}50` }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Main Sidebar ----------
export default function Sidebar({ sessions, selectedId, onSelect, activeView, onViewChange }: SidebarProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [cwd, setCwd] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [creatingTagForSession, setCreatingTagForSession] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const createSession = useCreateSession();
  const untrackSession = useUntrackSession();
  const { data: tags = [] } = useTags();
  const { data: assignments = [] } = useTagAssignments();
  const createTagMutation = useCreateTag();
  const assignTagMutation = useAssignTag();
  const removeTagMutation = useRemoveTag();

  useEffect(() => {
    if (cwd && !name) {
      setName(cwd.split('/').pop() ?? '');
    }
  }, [cwd]);

  const handleCreate = () => {
    if (!name || !cwd) return;
    createSession.mutate({ name, alias: alias || undefined, cwd }, {
      onSuccess: () => { setShowCreate(false); setName(''); setAlias(''); setCwd(''); },
    });
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId });
  }, []);

  const handleCreateTag = useCallback(async () => {
    if (!contextMenu) return;
    setCreatingTagForSession(contextMenu.sessionId);
    setNewTagName('');
  }, [contextMenu]);

  const handleNewTagSubmit = async () => {
    const tagName = newTagName.trim();
    const sessionId = creatingTagForSession;
    if (!tagName || !sessionId) return;
    // Clear UI immediately
    setCreatingTagForSession(null);
    setNewTagName('');
    // Then do the async work
    const tag = await createTagMutation.mutateAsync({ name: tagName });
    await assignTagMutation.mutateAsync({ tagId: tag.id, sessionId });
  };

  const toggleGroup = useCallback((tagId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }, []);

  // Build session → tags lookup
  const sessionTagMap = new Map<string, TagInfo[]>();
  const tagSessionMap = new Map<string, Set<string>>();
  for (const a of assignments) {
    const tag = tags.find(t => t.id === a.tagId);
    if (!tag) continue;
    if (!sessionTagMap.has(a.sessionId)) sessionTagMap.set(a.sessionId, []);
    sessionTagMap.get(a.sessionId)!.push(tag);
    if (!tagSessionMap.has(a.tagId)) tagSessionMap.set(a.tagId, new Set());
    tagSessionMap.get(a.tagId)!.add(a.sessionId);
  }

  // Group sessions: tagged sessions in groups, untagged in "ungrouped"
  const taggedSessionIds = new Set(assignments.map(a => a.sessionId));
  const ungroupedSessions = sessions.filter(s => !taggedSessionIds.has(s.id));

  // Tags that have at least one session
  const activeTags = tags.filter(t => tagSessionMap.has(t.id) && tagSessionMap.get(t.id)!.size > 0);

  return (
    <div className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold text-white">friendlist</h1>
        <p className="text-xs text-gray-500 mt-1">claude code control plane</p>
      </div>

      {/* Navigation */}
      <nav className="p-2 border-b border-gray-800 space-y-1">
        {['sessions', 'tasks', 'gossip', 'flows', 'tools'].map((view) => (
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

      {/* Sessions list (grouped) */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
        {/* Tag groups */}
        {activeTags.map(tag => {
          const memberIds = tagSessionMap.get(tag.id) ?? new Set();
          const members = sessions.filter(s => memberIds.has(s.id));
          if (members.length === 0) return null;
          const collapsed = collapsedGroups.has(tag.id);

          return (
            <div key={tag.id} data-testid="tag-group" data-tag-name={tag.name}>
              <button
                data-testid="tag-group-header"
                onClick={() => toggleGroup(tag.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-gray-800"
              >
                <span className="text-gray-500">{collapsed ? '>' : 'v'}</span>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                <span style={{ color: tag.color }} className="font-medium">{tag.name}</span>
                <span className="text-gray-600 ml-auto">{members.length}</span>
              </button>
              {!collapsed && members.map(session => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isSelected={selectedId === session.id}
                  sessionTags={sessionTagMap.get(session.id) ?? []}
                  onSelect={() => onSelect(session.id)}
                  onDelete={() => untrackSession.mutate(session.id)}
                  onContextMenu={(e) => handleContextMenu(e, session.id)}
                />
              ))}
            </div>
          );
        })}

        {/* Ungrouped sessions */}
        {ungroupedSessions.map(session => (
          <SessionItem
            key={session.id}
            session={session}
            isSelected={selectedId === session.id}
            sessionTags={sessionTagMap.get(session.id) ?? []}
            onSelect={() => onSelect(session.id)}
            onDelete={() => untrackSession.mutate(session.id)}
            onContextMenu={(e) => handleContextMenu(e, session.id)}
          />
        ))}
      </div>

      {/* New tag input (inline) */}
      {creatingTagForSession && (
        <div className="p-2 border-t border-gray-800">
          <div className="text-xs text-gray-400 mb-1">New tag name:</div>
          <input
            data-testid="new-tag-input"
            autoFocus
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNewTagSubmit();
              if (e.key === 'Escape') setCreatingTagForSession(null);
            }}
            onBlur={() => { if (!newTagName.trim()) setCreatingTagForSession(null); }}
            placeholder="Tag name..."
            className="w-full bg-gray-800 text-sm text-white px-2 py-1 rounded border border-gray-700 focus:border-blue-500 outline-none"
          />
        </div>
      )}

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

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          tags={tags}
          sessionTagIds={new Set((sessionTagMap.get(contextMenu.sessionId) ?? []).map(t => t.id))}
          onClose={() => setContextMenu(null)}
          onAddTag={(tagId) => assignTagMutation.mutate({ tagId, sessionId: contextMenu.sessionId })}
          onCreateTag={() => { setCreatingTagForSession(contextMenu.sessionId); setNewTagName(''); }}
          onRemoveTag={(tagId) => removeTagMutation.mutate({ tagId, sessionId: contextMenu.sessionId })}
        />
      )}
    </div>
  );
}
