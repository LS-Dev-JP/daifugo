import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, RoomSummary, RoomView, ServerMessage } from "./protocol";

export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting";

interface StoredSession {
  code: string;
  token: string;
}

// タブごとに別の席として扱うため sessionStorage を使う（再読み込みでは同じ席に戻れる）。
const sessionKey = "draw-daifugo:online-session";

function loadSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(sessionKey);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession | null): void {
  try {
    if (session) sessionStorage.setItem(sessionKey, JSON.stringify(session));
    else sessionStorage.removeItem(sessionKey);
  } catch {
    // 保存できない環境では再接続時の復帰を省略する。
  }
}

function socketUrl(): string {
  // 相対パスで解決し、リバースプロキシのサブパス配下でも動くようにする。
  const url = new URL("ws", window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export interface OnlineApi {
  status: ConnectionStatus;
  room: RoomView | null;
  error: string;
  hasSession: boolean;
  /** 募集中のルーム一覧（購読中のみ更新）。null は未取得。 */
  openRooms: RoomSummary[] | null;
  playingRooms: number;
  send: (message: ClientMessage) => void;
  /** 募集一覧の購読を開始・停止する。 */
  watchRooms: (watch: boolean) => void;
  clearError: () => void;
  leave: () => void;
}

export function useOnline(): OnlineApi {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState("");
  const [hasSession, setHasSession] = useState(() => loadSession() !== null);
  const [openRooms, setOpenRooms] = useState<RoomSummary[] | null>(null);
  const [playingRooms, setPlayingRooms] = useState(0);
  const watchingRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<ClientMessage[]>([]);
  const retryRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const wantedRef = useRef(false);

  const connect = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return;
    wantedRef.current = true;
    setStatus(retryRef.current > 0 ? "reconnecting" : "connecting");
    const socket = new WebSocket(socketUrl());
    socketRef.current = socket;

    socket.onopen = () => {
      retryRef.current = 0;
      setStatus("open");
      const session = loadSession();
      const queued = queueRef.current;
      queueRef.current = [];
      // 新しく作成・参加する操作が待っていなければ、前回の席に復帰する。
      const startsNewSession = queued.some((message) => message.type === "create" || message.type === "join");
      if (session && !startsNewSession) socket.send(JSON.stringify({ type: "resume", ...session } satisfies ClientMessage));
      else if (watchingRef.current && !startsNewSession) socket.send(JSON.stringify({ type: "watchRooms" } satisfies ClientMessage));
      for (const message of queued) socket.send(JSON.stringify(message));
    };
    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      if (message.type === "session") {
        saveSession({ code: message.code, token: message.token });
        setHasSession(true);
      } else if (message.type === "rooms") {
        setOpenRooms(message.rooms);
        setPlayingRooms(message.playing);
      } else if (message.type === "room") {
        setRoom(message.room);
      } else if (message.type === "error") {
        setError(message.message);
        if (message.fatal) {
          saveSession(null);
          setHasSession(false);
          setRoom(null);
        }
      }
    };
    socket.onclose = () => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      if (!wantedRef.current) {
        setStatus("idle");
        return;
      }
      setStatus("reconnecting");
      const delay = Math.min(10_000, 500 * 2 ** retryRef.current);
      retryRef.current += 1;
      timerRef.current = window.setTimeout(connect, delay);
    };
  }, []);

  const send = useCallback((message: ClientMessage) => {
    setError("");
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return;
    }
    queueRef.current.push(message);
    connect();
  }, [connect]);

  const watchRooms = useCallback((watch: boolean) => {
    watchingRef.current = watch;
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: watch ? "watchRooms" : "unwatchRooms" } satisfies ClientMessage));
    } else if (watch) {
      connect();
    }
  }, [connect]);

  const leave = useCallback(() => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "leave" } satisfies ClientMessage));
      // 接続は維持し、トップ画面の募集一覧をすぐ表示できるようにする。
      if (watchingRef.current) socket.send(JSON.stringify({ type: "watchRooms" } satisfies ClientMessage));
    }
    saveSession(null);
    setHasSession(false);
    setRoom(null);
    setError("");
  }, []);

  // 前回の参加情報があれば、自動で接続して席に戻る。
  useEffect(() => {
    if (loadSession()) connect();
    return () => {
      wantedRef.current = false;
      window.clearTimeout(timerRef.current);
      socketRef.current?.close();
    };
  }, [connect]);

  return { status, room, error, hasSession, openRooms, playingRooms, send, watchRooms, clearError: () => setError(""), leave };
}
