import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import type { SessionInfo, WSEvent, ImageAttachment } from '../../shared/types.js';
import { useSendPrompt, useSessionHistory } from '../hooks/useSessions.js';

/** Replace literal \n sequences with real newlines */
function fixNewlines(text: string): string {
  return text.replace(/\\n/g, '\n');
}

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
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const sendPrompt = useSendPrompt();
  const outputRef = useRef<HTMLDivElement>(null);
  const { data: history = [] } = useSessionHistory(session.id);

  // Merge history (from JSONL) with live messages (from current session)
  const allMessages: ChatMessage[] = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    ...messages,
  ];

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [allMessages, isSending, streamingOutput]);

  const handleSend = async () => {
    if ((!prompt.trim() && images.length === 0) || isSending) return;
    const userPrompt = prompt || (images.length > 0 ? 'Describe this image.' : '');
    const attachedImages = images.length > 0 ? [...images] : undefined;
    const imageCount = images.length;
    onAddMessage({
      role: 'user',
      content: imageCount > 0 ? `${userPrompt}\n[${imageCount} image${imageCount > 1 ? 's' : ''} attached]` : userPrompt,
    });
    onClearStreaming();
    setPrompt('');
    setImages([]);
    setIsSending(true);

    try {
      const data = await sendPrompt.mutateAsync({ id: session.id, prompt: userPrompt, images: attachedImages });
      onAddMessage({ role: 'assistant', content: data.result });
    } catch (err) {
      onAddMessage({ role: 'error', content: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          // Strip the data:image/...;base64, prefix
          const base64 = dataUrl.split(',')[1];
          const mediaType = file.type;
          setImages((prev) => [...prev, { data: base64, mediaType }]);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
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
        {allMessages.length === 0 && streamingOutput.length === 0 ? (
          <div className="text-gray-600 text-center mt-8">
            No output yet. Send a prompt to get started.
          </div>
        ) : (
          <>
            {allMessages.map((msg, i) => (
              <div key={i}>
                {msg.role === 'user' && (
                  <div className="flex gap-2">
                    <span className="text-blue-400 flex-shrink-0">{'>'}</span>
                    <span className="text-blue-300">{msg.content}</span>
                  </div>
                )}
                {msg.role === 'assistant' && (
                  <div className="text-gray-300 break-words pl-4 prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{fixNewlines(msg.content)}</ReactMarkdown>
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
                      <div className="whitespace-pre-wrap opacity-80">{fixNewlines(event.content)}</div>
                    </div>
                  );
                } else if (event.type === 'session:tool_use') {
                  return (
                    <div key={i} className="text-yellow-400 text-xs border-l-2 border-yellow-500 pl-2 my-1">
                      <div className="font-semibold">🔧 Tool: {event.tool}</div>
                      <div className="text-gray-500 mt-0.5 whitespace-pre-wrap">{fixNewlines(event.input)}</div>
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
        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {images.map((img, i) => (
              <div key={i} className="relative group">
                <img
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt={`Attachment ${i + 1}`}
                  className="h-16 w-16 object-cover rounded border border-gray-700"
                />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={images.length > 0 ? 'Add a message about the image(s)...' : 'Send a prompt... (paste images here)'}
            rows={2}
            className="flex-1 bg-gray-800 text-sm text-white px-3 py-2 rounded border border-gray-700 focus:border-blue-500 outline-none resize-none"
          />
          <button
            onClick={handleSend}
            disabled={(!prompt.trim() && images.length === 0) || isSending}
            className="px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded self-end"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
