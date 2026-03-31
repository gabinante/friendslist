import React, { useState, useMemo } from 'react';
import type { SessionInfo } from '../../shared/types.js';
import { useAllSessions, useTrackSession, useUntrackSession, useDeleteSession } from '../hooks/useSessions.js';

const STATUS_COLORS: Record<string, string> = {
  idle: 'text-gray-400',
  working: 'text-green-400',
  waiting_input: 'text-yellow-400',
  error: 'text-red-400',
  loop: 'text-blue-400',
  stopped: 'text-gray-600',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SessionsTableProps {
  onSelectSession: (id: string) => void;
}

export default function SessionsTable({ onSelectSession }: SessionsTableProps) {
  const { data: sessions = [] } = useAllSessions();
  const trackSession = useTrackSession();
  const untrackSession = useUntrackSession();
  const deleteSession = useDeleteSession();
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [trackFilter, setTrackFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'lastActivityAt' | 'createdAt' | 'name'>('lastActivityAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = useMemo(() => {
    let list = sessions;

    // Text filter
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.alias?.toLowerCase().includes(q)) ||
        s.cwd.toLowerCase().includes(q) ||
        (s.summary?.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      list = list.filter(s => s.status === statusFilter);
    }

    // Track filter
    if (trackFilter === 'tracked') {
      list = list.filter(s => s.tracked);
    } else if (trackFilter === 'untracked') {
      list = list.filter(s => !s.tracked);
    }

    // Sort
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else {
        cmp = new Date(a[sortField]).getTime() - new Date(b[sortField]).getTime();
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [sessions, filter, statusFilter, trackFilter, sortField, sortDir]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortIcon = (field: typeof sortField) => {
    if (sortField !== field) return '';
    return sortDir === 'desc' ? ' v' : ' ^';
  };

  const statuses = ['all', 'idle', 'working', 'stopped', 'error', 'waiting_input', 'loop'];

  return (
    <div className="flex flex-col h-full">
      {/* Header / Filters */}
      <div className="px-4 py-3 border-b border-gray-800 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-medium">All Sessions</h2>
          <span className="text-xs text-gray-500">{filtered.length} of {sessions.length}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search name, path, summary..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 min-w-[200px] bg-gray-800 text-sm text-white px-3 py-1.5 rounded border border-gray-700 focus:border-blue-500 outline-none"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-800 text-sm text-gray-300 px-2 py-1.5 rounded border border-gray-700 outline-none"
          >
            {statuses.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>
            ))}
          </select>
          <select
            value={trackFilter}
            onChange={(e) => setTrackFilter(e.target.value)}
            className="bg-gray-800 text-sm text-gray-300 px-2 py-1.5 rounded border border-gray-700 outline-none"
          >
            <option value="all">All</option>
            <option value="tracked">Tracked</option>
            <option value="untracked">Untracked</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-900 z-10">
            <tr className="text-left text-gray-500 text-xs border-b border-gray-800">
              <th className="px-4 py-2 w-8"></th>
              <th
                className="px-4 py-2 cursor-pointer hover:text-gray-300"
                onClick={() => handleSort('name')}
              >
                Name{sortIcon('name')}
              </th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Model</th>
              <th className="px-4 py-2">Directory</th>
              <th
                className="px-4 py-2 cursor-pointer hover:text-gray-300"
                onClick={() => handleSort('createdAt')}
              >
                Created{sortIcon('createdAt')}
              </th>
              <th
                className="px-4 py-2 cursor-pointer hover:text-gray-300"
                onClick={() => handleSort('lastActivityAt')}
              >
                Last Active{sortIcon('lastActivityAt')}
              </th>
              <th className="px-4 py-2">Summary</th>
              <th className="px-4 py-2 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-gray-600 py-8">
                  No sessions found
                </td>
              </tr>
            ) : (
              filtered.map(session => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onSelect={() => onSelectSession(session.id)}
                  onTrack={() => trackSession.mutate(session.id)}
                  onUntrack={() => untrackSession.mutate(session.id)}
                  onDelete={() => deleteSession.mutate(session.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SessionRow({
  session,
  onSelect,
  onTrack,
  onUntrack,
  onDelete,
}: {
  session: SessionInfo;
  onSelect: () => void;
  onTrack: () => void;
  onUntrack: () => void;
  onDelete: () => void;
}) {
  return (
    <tr
      className={`border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer ${
        !session.tracked ? 'opacity-50' : ''
      }`}
      onClick={onSelect}
    >
      <td className="px-4 py-2">
        <div className={`w-2 h-2 rounded-full ${session.tracked ? 'bg-blue-400' : 'bg-gray-700'}`} />
      </td>
      <td className="px-4 py-2">
        <div className="text-white font-medium">{session.alias || session.name}</div>
        {session.alias && <div className="text-xs text-gray-600">{session.name}</div>}
      </td>
      <td className="px-4 py-2">
        <span className={`text-xs ${STATUS_COLORS[session.status]}`}>
          {session.status}
        </span>
      </td>
      <td className="px-4 py-2 text-gray-400 text-xs">{session.model}</td>
      <td className="px-4 py-2">
        <span className="text-gray-500 text-xs truncate block max-w-[200px]" title={session.cwd}>
          {session.cwd}
        </span>
      </td>
      <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap" title={formatDate(session.createdAt)}>
        {formatDate(session.createdAt)}
      </td>
      <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap" title={formatDate(session.lastActivityAt)}>
        {timeAgo(session.lastActivityAt)}
      </td>
      <td className="px-4 py-2">
        <span className="text-gray-400 text-xs line-clamp-2 max-w-[300px] block">
          {session.summary || '—'}
        </span>
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {session.tracked ? (
            <button
              onClick={onUntrack}
              className="text-xs text-gray-500 hover:text-yellow-400 px-1.5 py-0.5 rounded hover:bg-gray-700"
              title="Untrack session"
            >
              hide
            </button>
          ) : (
            <button
              onClick={onTrack}
              className="text-xs text-gray-500 hover:text-green-400 px-1.5 py-0.5 rounded hover:bg-gray-700"
              title="Re-track session"
            >
              track
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-xs text-gray-500 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-gray-700"
            title="Permanently delete"
          >
            delete
          </button>
        </div>
      </td>
    </tr>
  );
}
