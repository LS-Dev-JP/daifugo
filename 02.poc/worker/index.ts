// Cloudflare Workers 用のエントリポイント。
// 画面（dist）は静的アセットとして配信し、オンライン対戦（/ws）は Durable Object 1つに集約する。
// ルームはこれまでの Node サーバーと同じく Durable Object のメモリ上だけに置く（再起動で消える）。
import { DurableObject } from "cloudflare:workers";
import type { ServerMessage } from "../src/online/protocol";
import { RoomManager, type Connection } from "../server/rooms";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  LOBBY: DurableObjectNamespace<Lobby>;
}

const securityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; base-uri 'self'; frame-ancestors 'none'",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/healthz")) {
      return new Response("ok", { headers: { "Content-Type": "text/plain" } });
    }
    if (url.pathname.endsWith("/ws")) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      // 全ルームを1か所で管理するため、Durable Object は常に同じ1つを使う。
      return env.LOBBY.get(env.LOBBY.idFromName("lobby")).fetch(request);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const assetResponse = await env.ASSETS.fetch(request);
    const response = new Response(assetResponse.body, assetResponse);
    for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
    if (url.pathname.includes("/assets/") && response.ok) {
      response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      response.headers.set("Cache-Control", "no-cache");
    }
    return response;
  },
};

const TICK_MS = 500;
// 接続が全員切れてもルームが残っている間は、アラームで定期的に起こしてメモリから追い出されないようにする。
const KEEPALIVE_MS = 10_000;

export class Lobby extends DurableObject<Env> {
  private readonly manager = new RoomManager();
  private readonly sockets = new Set<WebSocket>();
  private timer: ReturnType<typeof setInterval> | null = null;

  async fetch(): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    this.sockets.add(server);

    const conn: Connection = {
      send(message: ServerMessage) {
        try {
          server.send(JSON.stringify(message));
        } catch {
          // 切断済みの接続には送らない。
        }
      },
    };
    // 1秒あたり20件を超えるメッセージは破棄する。1件は8KBまで。
    let windowStart = Date.now();
    let count = 0;

    server.addEventListener("message", (event) => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        count = 0;
      }
      count += 1;
      if (count > 20 || typeof event.data !== "string") return;
      if (event.data.length > 8 * 1024) {
        server.close(1009, "message too large");
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        conn.send({ type: "error", message: "不正なリクエストです。" });
        return;
      }
      try {
        this.manager.handle(conn, parsed);
      } catch (error) {
        console.error(error);
        conn.send({ type: "error", message: "サーバーでエラーが発生しました。" });
      }
    });
    const onClose = () => {
      if (!this.sockets.delete(server)) return;
      this.manager.disconnect(conn);
      this.updateTimers();
    };
    server.addEventListener("close", onClose);
    server.addEventListener("error", onClose);

    this.updateTimers();
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm(): Promise<void> {
    this.manager.tick();
    await this.updateTimers();
  }

  private async updateTimers(): Promise<void> {
    if (this.sockets.size > 0) {
      this.timer ??= setInterval(() => this.manager.tick(), TICK_MS);
    } else if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.sockets.size > 0 || this.manager.roomCount > 0) {
      const current = await this.ctx.storage.getAlarm();
      if (current === null) await this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_MS);
    }
  }
}
