import { describe, expect, it } from "vitest";
import { RoomManager, parseClientMessage, type Connection } from "../server/rooms";
import type { RoomView, ServerMessage } from "../src/online/protocol";

class FakeConn implements Connection {
  messages: ServerMessage[] = [];
  send(message: ServerMessage) {
    this.messages.push(message);
  }
  get room(): RoomView {
    const rooms = this.messages.filter((message): message is Extract<ServerMessage, { type: "room" }> => message.type === "room");
    return rooms[rooms.length - 1].room;
  }
  get lastError(): string | undefined {
    const errors = this.messages.filter((message): message is Extract<ServerMessage, { type: "error" }> => message.type === "error");
    return errors[errors.length - 1]?.message;
  }
  get token(): string {
    const session = this.messages.find((message): message is Extract<ServerMessage, { type: "session" }> => message.type === "session");
    return session!.token;
  }
}

function setup(players = 2, capacity = 5, isPublic = true) {
  let now = 1_000_000;
  const manager = new RoomManager(() => now, { autoPlayMs: 1000 });
  const conns = Array.from({ length: players }, () => new FakeConn());
  manager.handle(conns[0], { type: "create", name: "ホスト", settings: { capacity, handSize: 5, jokerCount: 2, isPublic } });
  const code = conns[0].room.code;
  conns.slice(1).forEach((conn, index) => manager.handle(conn, { type: "join", code, name: `ゲスト${index + 1}` }));
  return { manager, conns, code, advance: (ms: number) => { now += ms; } };
}

describe("room manager", () => {
  it("creates a room and lets others join with the code", () => {
    const { conns, code } = setup(3);
    expect(code).toMatch(/^\d{4}$/);
    expect(conns[2].room.seats.map((seat) => seat.name)).toEqual(["ホスト", "ゲスト1", "ゲスト2"]);
    expect(conns[2].room.mySeat).toBe(2);
    expect(conns[0].room.hostSeat).toBe(0);
  });

  it("only sends each player their own hand", () => {
    const { manager, conns } = setup(3);
    manager.handle(conns[0], { type: "start" });
    for (const [index, conn] of conns.entries()) {
      const view = conn.room.game!;
      expect(view.myHand).toHaveLength(5);
      expect(view.players.every((player) => player.handCount === 5)).toBe(true);
      const json = JSON.stringify(conn.messages.filter((message) => message.type === "room"));
      // 他人の手札のカードIDが含まれていないこと
      for (const [other, otherConn] of conns.entries()) {
        if (other === index) continue;
        for (const card of otherConn.room.game!.myHand) expect(json).not.toContain(`"${card.id}"`);
      }
      expect(json).not.toContain('"deck":');
    }
  });

  it("rejects actions from players whose turn it is not", () => {
    const { manager, conns } = setup(2);
    manager.handle(conns[0], { type: "start" });
    manager.handle(conns[1], { type: "pass" });
    expect(conns[1].lastError).toBe("あなたの手番ではありません。");
    manager.handle(conns[0], { type: "pass" });
    expect(conns[0].room.game!.hasDrawn).toBe(true);
  });

  it("rejects cards that are not in the player's hand", () => {
    const { manager, conns } = setup(2);
    manager.handle(conns[0], { type: "start" });
    const otherCard = conns[1].room.game!.myHand[0].id;
    manager.handle(conns[0], { type: "play", cardIds: [otherCard] });
    expect(conns[0].lastError).toBe("選択したカードが手札にありません。");
  });

  it("only allows the host to start", () => {
    const { manager, conns } = setup(2);
    manager.handle(conns[1], { type: "start" });
    expect(conns[1].lastError).toBe("ホストだけが操作できます。");
    expect(conns[1].room.status).toBe("lobby");
  });

  it("lets a disconnected player resume the same seat with the token", () => {
    const { manager, conns, code } = setup(2);
    manager.handle(conns[0], { type: "start" });
    const token = conns[1].token;
    const hand = conns[1].room.game!.myHand.map((card) => card.id);
    manager.disconnect(conns[1]);
    expect(conns[0].room.seats[1].connected).toBe(false);

    const again = new FakeConn();
    manager.handle(again, { type: "resume", code, token });
    expect(again.room.mySeat).toBe(1);
    expect(again.room.game!.myHand.map((card) => card.id)).toEqual(hand);
  });

  it("auto-passes for a disconnected current player after the timeout", () => {
    const { manager, conns, advance } = setup(2);
    manager.handle(conns[0], { type: "start" });
    manager.disconnect(conns[0]);
    advance(1500);
    manager.tick();
    expect(conns[1].room.game!.currentPlayerIndex).toBe(1);
  });

  it("validates incoming messages", () => {
    const settings = { capacity: 4, handSize: 5, jokerCount: 0, isPublic: true };
    expect(parseClientMessage({ type: "play", cardIds: "S-3" })).toBeNull();
    expect(parseClientMessage({ type: "create", name: " ", settings })).toBeNull();
    expect(parseClientMessage({ type: "create", name: "a", settings: { ...settings, handSize: 9 } })).toBeNull();
    expect(parseClientMessage({ type: "create", name: "a", settings: { ...settings, capacity: 6 } })).toBeNull();
    expect(parseClientMessage({ type: "create", name: "a", settings: { ...settings, isPublic: "yes" } })).toBeNull();
    expect(parseClientMessage({ type: "join", code: "12a4", name: "a" })).toBeNull();
    expect(parseClientMessage({ type: "join", code: "1234", name: "長い名前の人ですよろしくお願いします" }))
      .toEqual({ type: "join", code: "1234", name: "長い名前の人ですよろしく" });
    expect(parseClientMessage({ type: "hack" })).toBeNull();
  });

  it("lists public recruiting rooms to watchers and keeps the list up to date", () => {
    const manager = new RoomManager(() => 0);
    const watcher = new FakeConn();
    manager.handle(watcher, { type: "watchRooms" });
    const host = new FakeConn();
    manager.handle(host, { type: "create", name: "ホスト", settings: { capacity: 3, handSize: 5, jokerCount: 2, isPublic: true } });
    const secret = new FakeConn();
    manager.handle(secret, { type: "create", name: "ひみつ", settings: { capacity: 3, handSize: 5, jokerCount: 2, isPublic: false } });

    const latest = () => watcher.messages.filter((message) => message.type === "rooms").at(-1) as Extract<ServerMessage, { type: "rooms" }>;
    expect(latest().rooms.map((room) => room.hostName)).toEqual(["ホスト"]);
    expect(latest().rooms[0]).toMatchObject({ capacity: 3, members: ["ホスト"] });

    const guest = new FakeConn();
    manager.handle(guest, { type: "join", code: host.room.code, name: "ゲスト" });
    expect(latest().rooms[0].members).toEqual(["ホスト", "ゲスト"]);

    // 満員になると一覧から消える
    manager.handle(new FakeConn(), { type: "join", code: host.room.code, name: "三人目" });
    expect(latest().rooms).toHaveLength(0);
  });

  it("starts automatically after the countdown once the room is full", () => {
    const { manager, conns, advance } = setup(3, 3);
    expect(conns[0].room.startsInMs).toBe(5000);
    expect(conns[0].room.status).toBe("lobby");
    advance(4000);
    manager.tick();
    expect(conns[0].room.status).toBe("lobby");
    advance(1000);
    manager.tick();
    expect(conns[0].room.status).toBe("playing");
    expect(conns[2].room.game!.myHand).toHaveLength(5);
  });

  it("cancels the countdown when someone leaves", () => {
    const { manager, conns, advance } = setup(3, 3);
    manager.handle(conns[2], { type: "leave" });
    expect(conns[0].room.startsInMs).toBeNull();
    advance(10_000);
    manager.tick();
    expect(conns[0].room.status).toBe("lobby");
  });

  it("refuses to join a full room", () => {
    const { manager, code } = setup(2, 2);
    const late = new FakeConn();
    manager.handle(late, { type: "join", code, name: "遅刻" });
    expect(late.lastError).toBe(`ルーム ${code} は満員です（2人募集）。`);
  });

  it("does not let the host shrink the capacity below the current members", () => {
    const { manager, conns } = setup(3, 5);
    manager.handle(conns[0], { type: "settings", settings: { capacity: 2, handSize: 5, jokerCount: 2, isPublic: true } });
    expect(conns[0].lastError).toBe("すでに3人が参加しているため、募集人数を減らせません。");
    manager.handle(conns[0], { type: "settings", settings: { capacity: 3, handSize: 5, jokerCount: 2, isPublic: true } });
    expect(conns[1].room.startsInMs).toBe(5000);
  });

  it("deletes a room when the last player leaves the lobby", () => {
    const { manager, conns } = setup(2);
    manager.handle(conns[0], { type: "leave" });
    expect(conns[1].room.hostSeat).toBe(0);
    expect(conns[1].room.seats).toHaveLength(1);
    manager.handle(conns[1], { type: "leave" });
    expect(manager.roomCount).toBe(0);
  });
});
