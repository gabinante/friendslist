import React, { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSessions, useAllSessions } from './hooks/useSessions.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import Sidebar from './components/Sidebar.js';
import SessionPanel from './components/SessionPanel.js';
import SessionsTable from './components/SessionsTable.js';
import TaskBoard from './components/TaskBoard.js';
import GossipPane from './components/GossipPane.js';
import FlowEditor from './components/FlowEditor.js';
import type { WSEvent } from '../shared/types.js';
import type { ChatMessage } from './components/SessionPanel.js';

export default function App() {
  const qc = useQueryClient();
  const { data: sessions = [] } = useSessions();
  const { data: allSessions = [] } = useAllSessions();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState('sessions');
  const [messagesMap, setMessagesMap] = useState<Record<string, ChatMessage[]>>({});
  const [streamingMap, setStreamingMap] = useState<Record<string, WSEvent[]>>({});

  const handleWSEvent = useCallback((event: WSEvent) => {
    switch (event.type) {
      case 'session:created':
      case 'session:updated':
      case 'session:deleted':
        qc.invalidateQueries({ queryKey: ['sessions'] });
        break;
      case 'session:output':
      case 'session:thinking':
      case 'session:tool_use':
      case 'session:result_meta':
        setStreamingMap(prev => ({
          ...prev,
          [event.sessionId]: [...(prev[event.sessionId] ?? []), event],
        }));
        break;
      case 'task:created':
      case 'task:updated':
        qc.invalidateQueries({ queryKey: ['tasks'] });
        break;
      case 'gossip:message':
      case 'gossip:response':
        qc.invalidateQueries({ queryKey: ['gossip'] });
        break;
      case 'notification':
        if (Notification.permission === 'granted') {
          new Notification(event.title, { body: event.body });
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission();
        }
        break;
    }
  }, [qc]);

  const { connected } = useWebSocket(handleWSEvent);
  const selectedSession = allSessions.find(s => s.id === selectedSessionId);

  const addMessage = useCallback((sessionId: string, msg: ChatMessage) => {
    setMessagesMap(prev => ({
      ...prev,
      [sessionId]: [...(prev[sessionId] ?? []), msg],
    }));
  }, []);

  const clearStreaming = useCallback((sessionId: string) => {
    setStreamingMap(prev => ({ ...prev, [sessionId]: [] }));
  }, []);

  return (
    <div className="flex h-screen bg-gray-950">
      <Sidebar
        sessions={sessions}
        selectedId={selectedSessionId}
        onSelect={(id) => { setSelectedSessionId(id); setActiveView('sessions'); }}
        activeView={activeView}
        onViewChange={(view) => {
          setActiveView(view);
          if (view === 'sessions') setSelectedSessionId(null);
        }}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Connection indicator */}
        <div className="flex items-center justify-end px-4 py-1 border-b border-gray-800">
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-xs text-gray-600 ml-1.5">
            {connected ? 'connected' : 'disconnected'}
          </span>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          {activeView === 'sessions' && (
            selectedSession ? (
              <SessionPanel
                session={selectedSession}
                messages={messagesMap[selectedSession.id] ?? []}
                streamingOutput={streamingMap[selectedSession.id] ?? []}
                onAddMessage={(msg) => addMessage(selectedSession.id, msg)}
                onClearStreaming={() => clearStreaming(selectedSession.id)}
              />
            ) : (
              <SessionsTable
                onSelectSession={(id) => { setSelectedSessionId(id); }}
              />
            )
          )}
          {activeView === 'tasks' && <TaskBoard />}
          {activeView === 'gossip' && <GossipPane sessions={sessions} />}
          {activeView === 'flows' && <FlowEditor />}
        </div>
      </div>
    </div>
  );
}
