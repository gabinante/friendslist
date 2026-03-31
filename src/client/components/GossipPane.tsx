import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api.js';
import type { SessionInfo } from '../../shared/types.js';

interface GossipPaneProps {
  sessions: SessionInfo[];
}

export default function GossipPane({ sessions }: GossipPaneProps) {
  const qc = useQueryClient();
  const { data: messages = [] } = useQuery({
    queryKey: ['gossip'],
    queryFn: () => api.getGossipMessages(),
    refetchInterval: 3000,
  });

  const sendGossip = useMutation({
    mutationFn: api.sendGossip,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gossip'] }),
  });

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [content, setContent] = useState('');

  const handleSend = () => {
    if (!from || !content) return;
    sendGossip.mutate({
      fromSessionId: from,
      toSessionId: to || undefined,
      content,
    }, {
      onSuccess: () => setContent(''),
    });
  };

  const sessionName = (id: string) =>
    sessions.find(s => s.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-white font-medium">Gossip</h2>
        <p className="text-xs text-gray-500 mt-0.5">Inter-session communication</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-gray-600 text-center mt-8 text-sm">
            No messages yet.
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="bg-gray-900 rounded p-3 border border-gray-800">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="text-blue-400">{sessionName(msg.fromSessionId)}</span>
                <span>&rarr;</span>
                <span className="text-green-400">
                  {msg.toSessionId ? sessionName(msg.toSessionId) : 'broadcast'}
                </span>
                <span className="ml-auto">{msg.status}</span>
              </div>
              <p className="text-sm text-gray-300 mt-1">{msg.content}</p>
              {msg.responseContent && (
                <div className="mt-2 pl-3 border-l-2 border-gray-700">
                  <p className="text-sm text-gray-400">{msg.responseContent}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Send form */}
      <div className="p-3 border-t border-gray-800 space-y-2">
        <div className="flex gap-2">
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-gray-800 text-sm text-white px-2 py-1 rounded border border-gray-700 outline-none"
          >
            <option value="">From...</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-gray-800 text-sm text-white px-2 py-1 rounded border border-gray-700 outline-none"
          >
            <option value="">Broadcast</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Message..."
            className="flex-1 bg-gray-800 text-sm text-white px-2 py-1 rounded border border-gray-700 outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button
            onClick={handleSend}
            disabled={!from || !content}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white text-sm px-3 py-1 rounded"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
