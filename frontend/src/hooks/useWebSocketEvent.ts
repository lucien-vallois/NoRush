import { useEffect, useRef } from 'react';
import { useWebSocket, WsEventHandler } from '../contexts/WebSocketContext';

/**
 * Assina um evento do WebSocket pelo tempo de vida do componente.
 * O handler é guardado em ref para permitir callbacks instáveis
 * (defs inline / closures sobre estado) sem ressuscitar a assinatura.
 */
export function useWebSocketEvent<T = any>(event: string, handler: WsEventHandler<T>): void {
  const { subscribe } = useWebSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsubscribe = subscribe<T>(event, (payload, message) => {
      handlerRef.current(payload, message);
    });
    return unsubscribe;
  }, [event, subscribe]);
}
