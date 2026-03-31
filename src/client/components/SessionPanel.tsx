import React, { useState, useEffect, useRef } from 'react';
import type { SessionInfo, WSEvent } from '../../shared/types.js';
import { useSendPrompt } from '../hooks/useSessions.js';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'error';
  content: string;
}

interface SessionPanelProps {
  session: SessionInfo;
  messages: ChatMessage[];
  streamingOutput: WSEvent[];
  onAddMessage: (msg: ChatMessage) => void;
  onClearStreaming: () => void;
}

export default function SessionPanel({ session, messages, streamingOutput, onAddMessage, onClearStreaming }: SessionPanelProps) {
  const [prompt, setPrompt] = useState('');
  const sendPrompt = useSendPrompt();
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [messages, sendPrompt.isPending, streamingOutput]);

  const handleSend = () => {
    if (!prompt.trim() || sendPrompt.isPending) return;
    const userPrompt = prompt;
    onAddMessage({ role: 'user', content: userPrompt });
    onClearStreaming(); // Clear streaming output from previous prompt
    setPrompt('');

    sendPrompt.mutate({ id: session.id, prompt: userPrompt }, {
      onSuccess: (data) => {
        onAddMessage({ role: 'assistant', content: data.result });
      },
      onError: (err) => {
        onAddMessage({ role: 'error', content: err.message });
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="text-white font-medium">{session.name}</h2>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
            <span>{session.status}</span>
            <span>{session.model}</span>
            <span className="truncate max-w-xs">{session.cwd}</span>
          </div>
        </div>
        {session.pid && (
          <span className="text-xs text-gray-600">PID: {session.pid}</span>
        )}
      </div>

      {/* Conversation */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto scrollbar-thin p-4 font-mono text-sm leading-relaxed space-y-4"
      >
        {messages.length === 0 && streamingOutput.length === 0 ? (
          <div className="text-gray-600 text-center mt-8">
            No output yet. Send a prompt to get started.
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.role === 'user' && (
                  <div className="flex gap-2">
                    <span className="text-blue-400 flex-shrink-0">{'>'}</span>
                    <span className="text-blue-300">{msg.content}</span>
                  </div>
                )}
                {msg.role === 'assistant' && (
                  <div className="text-gray-300 whitespace-pre-wrap break-words pl-4">
                    {msg.content}
                  </div>
                )}
                {msg.role === 'error' && (
                  <div className="text-red-400 pl-4">
                    Error: {msg.content}
                  </div>
                )}
              </div>
            ))}

            {/* Streaming output */}
            <div className="pl-4 space-y-2">
              {streamingOutput.map((event, i) => {
                if (event.type === 'session:thinking') {
                  return (
                    <div key={i} className="text-purple-400 text-xs border-l-2 border-purple-500 pl-2 my-1">
                      <div className="font-semibold mb-1">💭 Thinking</div>
                      <div className="whitespace-pre-wrap opacity-80">{event.content}</div>
                    </div>
                  );
                } else if (event.type === 'session:tool_use') {
                  return (
                    <div key={i} className="text-yellow-400 text-xs border-l-2 border-yellow-500 pl-2 my-1">
                      <div className="font-semibold">🔧 Tool: {event.tool}</div>
                      <div className="text-gray-500 mt-0.5 whitespace-pre-wrap">{event.input}</div>
                    </div>
                  );
                } else if (event.type === 'session:output' && event.messageType === 'system') {
                  try {
                    const parsed = JSON.parse(event.content);
                    if (parsed.subtype === 'token_usage') {
                      return (
                        <div key={i} className="text-gray-600 text-xs my-1">
                          📊 Tokens: {parsed.input_tokens ?? 0} in / {parsed.output_tokens ?? 0} out
                        </div>
                      );
                    }
                  } catch {
                    // Ignore parse errors
                  }
                } else if (event.type === 'session:result_meta') {
                  return (
                    <div key={i} className="text-gray-600 text-xs my-1 border-t border-gray-800 pt-1">
                      ✅ Complete • {event.model} • ${event.costUsd.toFixed(4)} • {(event.durationMs / 1000).toFixed(1)}s
                    </div>
                  );
                } else if (event.type === 'session:output' && event.messageType === 'stderr') {
                  return (
                    <div key={i} className="text-red-500 text-xs my-1">
                      stderr: {event.content}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </>
        )}
      </div>

      {/* Prompt input */}
      <div className="p-3 border-t border-gray-800">
        <div className="flex gap-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a prompt..."
            rows={2}
            className="flex-1 bg-gray-800 text-sm text-white px-3 py-2 rounded border border-gray-700 focus:border-blue-500 outline-none resize-none"
          />
          <button
            onClick={handleSend}
            disabled={!prompt.trim() || sendPrompt.isPending}
            className="px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded self-end"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
