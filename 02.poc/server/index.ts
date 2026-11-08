import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import type { ServerMessage } from "../src/online/protocol";
import { RoomManager, type Connection } from "./rooms";

const port = Number(process.env.PORT ?? 8090);
const staticRoot = resolve(process.env.STATIC_DIR ?? "dist");

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webp": "image/webp",
};

const securityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; base-uri 'self'; frame-ancestors 'none'",
};

async function serveStatic(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname.endsWith("/healthz")) {
    response.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
    return;
  }
  // リバースプロキシのサブパス配下（/daifugo/ など）でも動くよう、末尾のファイル名部分で解決する。
  const assetIndex = url.pathname.indexOf("/assets/");
  const relative = assetIndex >= 0 ? url.pathname.slice(assetIndex + 1) : "index.html";
  let filePath = normalize(join(staticRoot, decodeURIComponent(relative)));
  if (!filePath.startsWith(staticRoot + sep)) {
    response.writeHead(400).end();
    return;
  }
  let info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    if (assetIndex >= 0) {
      response.writeHead(404).end();
      return;
    }
    filePath = join(staticRoot, "index.html");
    info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) {
      response.writeHead(500).end("dist/index.html not found");
      return;
    }
  }
  const isAsset = filePath.includes(`${sep}assets${sep}`);
  response.writeHead(200, {
    ...securityHeaders,
    "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control": isAsset ? "public, max-age=31536000, immutable" : "no-cache",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

const manager = new RoomManager();
const server = createServer((request, response) => {
  serveStatic(request, response).catch((error: unknown) => {
    console.error(error);
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
const alive = new WeakSet<WebSocket>();

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (!url.pathname.endsWith("/ws")) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
});

wss.on("connection", (ws: WebSocket) => {
  alive.add(ws);
  const conn: Connection = {
    send(message: ServerMessage) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    },
  };
  // 1秒あたり20件を超えるメッセージは破棄する。
  let windowStart = Date.now();
  let count = 0;

  ws.on("pong", () => alive.add(ws));
  ws.on("message", (data, isBinary) => {
    const now = Date.now();
    if (now - windowStart > 1000) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    if (count > 20 || isBinary) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      conn.send({ type: "error", message: "不正なリクエストです。" });
      return;
    }
    try {
      manager.handle(conn, parsed);
    } catch (error) {
      console.error(error);
      conn.send({ type: "error", message: "サーバーでエラーが発生しました。" });
    }
  });
  ws.on("close", () => manager.disconnect(conn));
  ws.on("error", () => manager.disconnect(conn));
});

// 応答のない接続を切断し、ルームの定期処理を行う。
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) {
      ws.terminate();
      continue;
    }
    alive.delete(ws);
    ws.ping();
  }
}, 30_000).unref();
// 自動開始のカウントダウンに追従できるよう、0.5秒ごとに実行する。
setInterval(() => manager.tick(), 500).unref();

server.listen(port, () => {
  console.log(`Draw Daifugo server listening on :${port} (static: ${staticRoot})`);
});

function shutdown(): void {
  console.log("shutting down");
  for (const ws of wss.clients) ws.close(1001, "server shutdown");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
