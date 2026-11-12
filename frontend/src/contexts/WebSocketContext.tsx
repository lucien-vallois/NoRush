import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { io } from "socket.io-client";
import { WebSocketMessage } from "../types";
import { useAuth } from "./AuthContext";

export type WsEventHandler<T = any> = (
  payload: T,
  message: WebSocketMessage,
) => void;
interface WebSocketContextType {
  isConnected: boolean;
  lastEventAt: string | null;
  subscribe: <T = any>(event: string, cb: WsEventHandler<T>) => () => void;
}
const WebSocketContext = createContext<WebSocketContextType | undefined>(
  undefined,
);
const DATA_EVENTS = new Set(["reading", "alert", "anomaly", "forecast"]);

export const WebSocketProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [token, setToken] = useState(() => localStorage.getItem("auth_token"));
  const listenersRef = useRef(new Map<string, Set<WsEventHandler>>());

  useEffect(() => {
    const update = () => setToken(localStorage.getItem("auth_token"));
    window.addEventListener("norush:token", update);
    return () => window.removeEventListener("norush:token", update);
  }, []);

  // Reconnect only when the signed-in user or the token changes, not on
  // every profile refresh (a new `user` object with the same id).
  const userId = user?.id;
  useEffect(() => {
    if (!userId || !token) return;
    const socket = io(import.meta.env.VITE_WS_URL || "http://localhost:3000", {
      auth: { token },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));
    socket.on("connect_error", () => setIsConnected(false));
    socket.onAny((event: string, raw: any) => {
      const message: WebSocketMessage =
        raw && typeof raw === "object" && "payload" in raw
          ? raw
          : { type: event, payload: raw, timestamp: new Date().toISOString() };
      if (DATA_EVENTS.has(event)) setLastEventAt(message.timestamp);
      listenersRef.current
        .get(event)
        ?.forEach((handler) => handler(message.payload, message));
    });
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      setIsConnected(false);
      setLastEventAt(null);
    };
  }, [userId, token]);

  const subscribe = useCallback(
    <T = any,>(event: string, cb: WsEventHandler<T>) => {
      const listeners = listenersRef.current;
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb as WsEventHandler);
      return () => {
        const handlers = listeners.get(event);
        handlers?.delete(cb as WsEventHandler);
        if (!handlers?.size) listeners.delete(event);
      };
    },
    [],
  );
  const value = useMemo(
    () => ({ isConnected, lastEventAt, subscribe }),
    [isConnected, lastEventAt, subscribe],
  );
  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context)
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  return context;
};
