import { randomBytes, randomInt } from "node:crypto";
import { pass, playCards, resolveEffect, startGame } from "../src/game/engine";
import { parseRules } from "../src/game/rules";
import type { ActionResult, GameState } from "../src/game/types";
import {
  autoStartDelayMs,
  maxSeats,
  minSeats,
  toGameView,
  turnTimeMs,
  type ClientMessage,
  type RoomSettings,
  type RoomSummary,
  type RoomView,
  type ServerMessage,
} from "../src/online/protocol";

export interface Connection {
  send(message: ServerMessage): void;
}

interface Seat {
  token: string;
  name: string;
  conn: Connection | null;
  disconnectedAt: number | null;
  left: boolean;
}

interface Room {
  code: string;
  host: Seat;
  settings: RoomSettings;
  seats: Seat[];
  status: RoomView["status"];
  game: GameState | null;
  version: number;
  createdAt: number;
  lastActivity: number;
  turnStartedAt: number;
  /** 募集人数がそろった場合の自動開始時刻。 */
  startAt: number | null;
}

export interface RoomManagerOptions {
  maxRooms: number;
  /** 手番の思考時間。過ぎると接続の有無にかかわらず自動で進める。 */
  turnTimeMs: number;
  /** 全員が切断してからルームを削除するまでの時間。 */
  roomTtlMs: number;
  /** ロビーで切断したままの席を外すまでの時間。 */
  lobbySeatTtlMs: number;
  /** 募集一覧に載せる最大件数。 */
  listLimit: number;
}

const defaultOptions: RoomManagerOptions = {
  maxRooms: 200,
  turnTimeMs,
  roomTtlMs: 15 * 60_000,
  lobbySeatTtlMs: 2 * 60_000,
  listLimit: 50,
};

function asString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}

function asCardIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  return value.every((item) => typeof item === "string" && item.length <= 16) ? (value as string[]) : null;
}

function inRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

function asSettings(value: unknown): RoomSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const { capacity, handSize, jokerCount, isPublic, rules: rawRules } = value as Record<string, unknown>;
  if (!inRange(capacity, minSeats, maxSeats) || !inRange(handSize, 5, 7) || !inRange(jokerCount, 0, 2)) return null;
  if (typeof isPublic !== "boolean") return null;
  // ルールを省略した場合は既定のルールで遊ぶ。
  const rules = parseRules(rawRules);
  if (!rules) return null;
  return { capacity, handSize, jokerCount, isPublic, rules };
}

function asRoomCode(value: unknown): string | null {
  const code = asString(value, 8)?.trim();
  return code && /^\d{4}$/.test(code) ? code : null;
}

function cleanName(value: unknown): string | null {
  const name = asString(value, 64)?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!name) return null;
  return Array.from(name).slice(0, 12).join("");
}

/** 受信したメッセージの形を検証する。不正なら null。 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const message = raw as Record<string, unknown>;
  switch (message.type) {
    case "create": {
      const name = cleanName(message.name);
      const settings = asSettings(message.settings);
      return name && settings ? { type: "create", name, settings } : null;
    }
    case "join": {
      const name = cleanName(message.name);
      const code = asRoomCode(message.code);
      return name && code ? { type: "join", name, code } : null;
    }
    case "resume": {
      const code = asRoomCode(message.code);
      const token = asString(message.token, 64);
      return code && token ? { type: "resume", code, token } : null;
    }
    case "settings": {
      const settings = asSettings(message.settings);
      return settings ? { type: "settings", settings } : null;
    }
    case "play":
    case "resolve": {
      const cardIds = asCardIds(message.cardIds);
      return cardIds ? { type: message.type, cardIds } : null;
    }
    case "watchRooms":
    case "unwatchRooms":
    case "start":
    case "pass":
    case "leave":
      return { type: message.type };
    default:
      return null;
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly sessions = new Map<Connection, { room: Room; seat: Seat }>();
  private readonly watchers = new Set<Connection>();
  private lastListing = "";
  private readonly options: RoomManagerOptions;

  constructor(private readonly now: () => number = Date.now, options: Partial<RoomManagerOptions> = {}) {
    this.options = { ...defaultOptions, ...options };
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  handle(conn: Connection, raw: unknown): void {
    const message = parseClientMessage(raw);
    if (!message) {
      conn.send({ type: "error", message: "不正なリクエストです。" });
      return;
    }
    switch (message.type) {
      case "watchRooms": {
        this.watchers.add(conn);
        const listing = this.listing();
        // 一覧を見ている接続は常に最新を受け取っているため、ここで基準を更新しておく。
        this.lastListing = JSON.stringify(listing);
        conn.send(listing);
        return;
      }
      case "unwatchRooms":
        this.watchers.delete(conn);
        return;
      case "create":
        return this.create(conn, message.name, message.settings);
      case "join":
        return this.join(conn, message.code, message.name);
      case "resume":
        return this.resume(conn, message.code, message.token);
      case "leave":
        return this.leave(conn);
      default:
        return this.roomAction(conn, message);
    }
  }

  disconnect(conn: Connection): void {
    this.watchers.delete(conn);
    const session = this.sessions.get(conn);
    if (!session) return;
    this.sessions.delete(conn);
    const { room, seat } = session;
    if (seat.conn !== conn) return;
    seat.conn = null;
    seat.disconnectedAt = this.now();
    this.ensureHost(room);
    this.updateCountdown(room);
    this.broadcast(room, false);
  }

  /** 定期処理：自動開始、思考時間切れの自動進行、使われなくなったルームの削除。 */
  tick(): void {
    const now = this.now();
    for (const room of this.rooms.values()) {
      if (room.seats.every((seat) => !seat.conn)) {
        if (now - room.lastActivity > this.options.roomTtlMs) this.deleteRoom(room);
        continue;
      }
      if (room.status === "playing") {
        this.autoPlay(room, now);
        continue;
      }
      const before = room.seats.length;
      room.seats = room.seats.filter((seat) =>
        seat.conn || (!seat.left && seat.disconnectedAt !== null && now - seat.disconnectedAt < this.options.lobbySeatTtlMs));
      if (room.seats.length !== before) {
        this.ensureHost(room);
        this.updateCountdown(room);
        this.broadcast(room, false);
      }
      if (room.status === "lobby" && room.startAt !== null && now >= room.startAt) this.startRoom(room);
    }
  }

  private autoPlay(room: Room, now: number): void {
    const game = room.game;
    if (!game || game.phase === "finished") return;
    const seat = room.seats[game.currentPlayerIndex];
    if (!seat) return;
    // 退出したプレイヤーは待たずに進める。それ以外は接続中・切断中とも思考時間で区切る。
    const waited = seat.left ? Infinity : now - room.turnStartedAt;
    if (waited < this.options.turnTimeMs) return;

    let state: GameState = game;
    if (state.phase === "effect" && state.pendingEffect) {
      const hand = state.players[state.currentPlayerIndex].hand;
      const result = resolveEffect(state, hand.slice(0, state.pendingEffect.count).map((card) => card.id));
      if (result.ok) state = result.state;
    } else {
      for (let attempt = 0; attempt < 2 && state.currentPlayerIndex === game.currentPlayerIndex && state.phase === "playing"; attempt += 1) {
        const result = pass(state);
        if (!result.ok) break;
        state = result.state;
      }
    }
    const reason = seat.conn ? "時間切れのため" : "接続が切れているため";
    state.log = [...state.log.slice(-39), `${seat.name}は${reason}自動で進行しました。`];
    this.commit(room, state);
  }

  private create(conn: Connection, name: string, settings: RoomSettings): void {
    this.leave(conn);
    if (this.rooms.size >= this.options.maxRooms) {
      conn.send({ type: "error", message: "ルーム数が上限に達しています。しばらくしてからお試しください。" });
      return;
    }
    let code = "";
    do {
      code = String(randomInt(1000, 10000));
    } while (this.rooms.has(code));
    const seat = this.newSeat(conn, name);
    const now = this.now();
    const room: Room = {
      code, host: seat, settings, seats: [seat], status: "lobby", game: null, version: 1,
      createdAt: now, lastActivity: now, turnStartedAt: now, startAt: null,
    };
    this.rooms.set(code, room);
    this.attach(conn, room, seat);
  }

  private join(conn: Connection, code: string, name: string): void {
    const room = this.rooms.get(code);
    if (!room) {
      conn.send({ type: "error", message: `ルーム ${code} は見つかりません。番号を確認してください。` });
      return;
    }
    if (room.status === "playing") {
      conn.send({ type: "error", message: "このルームはゲーム中のため参加できません。" });
      return;
    }
    if (room.seats.length >= room.settings.capacity) {
      conn.send({ type: "error", message: `ルーム ${code} は満員です（${room.settings.capacity}人募集）。` });
      return;
    }
    this.leave(conn);
    const taken = new Set(room.seats.map((seat) => seat.name));
    let unique = name;
    for (let suffix = 2; taken.has(unique); suffix += 1) unique = `${Array.from(name).slice(0, 10).join("")}${suffix}`;
    const seat = this.newSeat(conn, unique);
    room.seats.push(seat);
    this.attach(conn, room, seat);
  }

  private resume(conn: Connection, code: string, token: string): void {
    const room = this.rooms.get(code);
    const seat = room?.seats.find((item) => item.token === token && !item.left);
    if (!room || !seat) {
      conn.send({ type: "error", message: "ルームが終了したか、参加情報が見つかりません。", fatal: true });
      return;
    }
    if (seat.conn && seat.conn !== conn) {
      const previous = seat.conn;
      this.sessions.delete(previous);
      previous.send({ type: "error", message: "別の画面で同じ席に接続しました。", fatal: true });
    }
    this.attach(conn, room, seat);
  }

  private leave(conn: Connection): void {
    const session = this.sessions.get(conn);
    if (!session) return;
    this.sessions.delete(conn);
    const { room, seat } = session;
    seat.conn = null;
    seat.disconnectedAt = this.now();
    if (room.status === "playing") {
      seat.left = true;
    } else {
      room.seats = room.seats.filter((item) => item !== seat);
    }
    if (room.seats.length === 0) {
      this.deleteRoom(room);
      return;
    }
    this.ensureHost(room);
    this.updateCountdown(room);
    this.broadcast(room, false);
  }

  private roomAction(conn: Connection, message: ClientMessage): void {
    const session = this.sessions.get(conn);
    if (!session) {
      conn.send({ type: "error", message: "ルームに参加していません。" });
      return;
    }
    const { room, seat } = session;
    room.lastActivity = this.now();
    const seatIndex = room.seats.indexOf(seat);

    if (message.type === "settings" || message.type === "start") {
      if (room.host !== seat) {
        conn.send({ type: "error", message: "ホストだけが操作できます。" });
        return;
      }
      if (room.status === "playing") {
        conn.send({ type: "error", message: "ゲーム中は変更できません。" });
        return;
      }
      if (message.type === "settings") {
        if (message.settings.capacity < room.seats.length) {
          conn.send({ type: "error", message: `すでに${room.seats.length}人が参加しているため、募集人数を減らせません。` });
          return;
        }
        room.settings = message.settings;
        this.updateCountdown(room);
        this.broadcast(room, false);
        return;
      }
      this.startRoom(room, conn);
      return;
    }

    const game = room.game;
    if (room.status !== "playing" || !game) {
      conn.send({ type: "error", message: "ゲームが始まっていません。" });
      return;
    }
    if (game.currentPlayerIndex !== seatIndex) {
      conn.send({ type: "error", message: "あなたの手番ではありません。" });
      return;
    }
    let result: ActionResult;
    if (message.type === "play") result = playCards(game, message.cardIds);
    else if (message.type === "resolve") result = resolveEffect(game, message.cardIds);
    else if (message.type === "pass") result = pass(game);
    else return;
    if (!result.ok) {
      conn.send({ type: "error", message: result.error });
      return;
    }
    this.commit(room, result.state);
  }

  /** ゲームを開始する。requester が指定された場合は、開始できない理由をその接続に返す。 */
  private startRoom(room: Room, requester?: Connection): void {
    room.seats = room.seats.filter((item) => item.conn && !item.left);
    room.startAt = null;
    if (room.seats.length < minSeats) {
      this.ensureHost(room);
      this.broadcast(room, false);
      requester?.send({ type: "error", message: `${minSeats}人以上そろうと開始できます。` });
      return;
    }
    room.game = startGame({
      playerCount: room.seats.length,
      handSize: room.settings.handSize,
      jokerCount: room.settings.jokerCount,
      rules: room.settings.rules,
      playerNames: room.seats.map((item) => item.name),
    });
    room.status = "playing";
    room.turnStartedAt = this.now();
    this.ensureHost(room);
    this.broadcast(room, true);
  }

  /** 募集人数がそろい全員が接続中なら自動開始の時刻を設定し、条件を満たさなくなったら取り消す。 */
  private updateCountdown(room: Room): void {
    const full = room.status === "lobby"
      && room.seats.length >= room.settings.capacity
      && room.seats.every((seat) => seat.conn);
    if (!full) room.startAt = null;
    else if (room.startAt === null) room.startAt = this.now() + autoStartDelayMs;
  }

  private commit(room: Room, state: GameState): void {
    const previous = room.game;
    room.game = state;
    room.lastActivity = this.now();
    // 手番・フェーズ・選択する効果が変わったら思考時間を数え直す（パスでドローしただけでは数え直さない）。
    if (!previous || previous.currentPlayerIndex !== state.currentPlayerIndex || previous.phase !== state.phase ||
      previous.pendingEffect?.type !== state.pendingEffect?.type) {
      room.turnStartedAt = this.now();
    }
    if (state.phase === "finished") {
      room.status = "finished";
      room.seats = room.seats.filter((seat) => !seat.left);
      this.ensureHost(room);
    }
    this.broadcast(room, true);
  }

  private newSeat(conn: Connection, name: string): Seat {
    return { token: randomBytes(16).toString("hex"), name, conn, disconnectedAt: null, left: false };
  }

  private attach(conn: Connection, room: Room, seat: Seat): void {
    this.watchers.delete(conn);
    seat.conn = conn;
    seat.disconnectedAt = null;
    room.lastActivity = this.now();
    this.sessions.set(conn, { room, seat });
    conn.send({ type: "session", code: room.code, token: seat.token });
    this.ensureHost(room);
    this.updateCountdown(room);
    this.broadcast(room, false);
  }

  private deleteRoom(room: Room): void {
    this.rooms.delete(room.code);
    this.publishRooms();
  }

  /** ホストが不在なら、接続中の最初の席にホストを移す。 */
  private ensureHost(room: Room): void {
    if (room.seats.includes(room.host) && room.host.conn) return;
    room.host = room.seats.find((seat) => seat.conn) ?? room.seats[0] ?? room.host;
  }

  private broadcast(room: Room, gameChanged: boolean): void {
    room.version += 1;
    room.seats.forEach((seat, index) => {
      if (!seat.conn) return;
      seat.conn.send({ type: "room", room: this.view(room, index, gameChanged) });
    });
    this.publishRooms();
  }

  private listing(): Extract<ServerMessage, { type: "rooms" }> {
    const rooms: RoomSummary[] = [...this.rooms.values()]
      .filter((room) => room.settings.isPublic && room.status === "lobby" && room.startAt === null && room.seats.length < room.settings.capacity)
      // 開始が近い（残り枠が少ない）ルームを上に、同じなら新しい順。
      .sort((left, right) =>
        (left.settings.capacity - left.seats.length) - (right.settings.capacity - right.seats.length) || right.createdAt - left.createdAt)
      .slice(0, this.options.listLimit)
      .map((room) => ({
        code: room.code,
        hostName: room.host.name,
        members: room.seats.map((seat) => seat.name),
        capacity: room.settings.capacity,
        handSize: room.settings.handSize,
        jokerCount: room.settings.jokerCount,
        rules: room.settings.rules,
      }));
    const playing = [...this.rooms.values()].filter((room) => room.status === "playing").length;
    return { type: "rooms", rooms, playing };
  }

  /** 募集一覧が変わった場合だけ、一覧を見ている接続へ送る。 */
  private publishRooms(): void {
    if (this.watchers.size === 0) return;
    const message = this.listing();
    const serialized = JSON.stringify(message);
    if (serialized === this.lastListing) return;
    this.lastListing = serialized;
    for (const watcher of this.watchers) watcher.send(message);
  }

  private view(room: Room, seatIndex: number, gameChanged: boolean): RoomView {
    const game = room.game && room.status !== "lobby" ? toGameView(room.game, seatIndex) : null;
    // 演出は状態が変わったときだけ表示させる（接続・設定変更の通知では出さない）。
    if (game && !gameChanged) game.events = [];
    return {
      code: room.code,
      status: room.status,
      hostSeat: Math.max(0, room.seats.indexOf(room.host)),
      mySeat: seatIndex,
      settings: room.settings,
      seats: room.seats.map((seat) => ({ name: seat.name, connected: seat.conn !== null })),
      version: room.version,
      startsInMs: room.startAt === null ? null : Math.max(0, room.startAt - this.now()),
      turnEndsInMs: room.status === "playing" && room.game && room.game.phase !== "finished"
        ? Math.max(0, room.turnStartedAt + this.options.turnTimeMs - this.now())
        : null,
      game,
    };
  }
}
