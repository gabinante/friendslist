import { useEffect, useRef, useCallback, useState } from 'react';
import type { WSEvent } from '../../shared/types.js';

type WSHandler = (event: WSEvent) => void;

export function useWebSocket(onEvent: WSHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 2s
      setTimeout(connect, 2000);
    };
    ws.onmessage = (event) => {
      try {
        const data: WSEvent = JSON.parse(event.data);
        onEvent(data);
      } catch {
        // ignore malformed messages
      }
    };

    wsRef.current = ws;
  }, [onEvent]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  return { connected };
}
