import { describe, expect, it } from "vitest";
import { assertCardIntegrity, pass, playCards, previewPlay, resolveEffect, startGame } from "../src/game/engine";
import type { Card, GameState, Trick } from "../src/game/types";

function card(id: string, suit: Card["suit"], rank: number | null, isJoker = false): Card {
  return { id, suit, rank, isJoker };
}

function trick(partial: Partial<Trick>): Trick {
  return {
    kind: "single", count: 1, rank: 8, lowRank: 8, highRank: 8, suits: ["C"], playerId: "player-2",
    isJokerSingle: false, isRevolution: false, cards: [], ...partial,
  };
}

function stateWithHands(hands: Card[][]): GameState {
  return {
    players: hands.map((hand, index) => ({ id: `player-${index + 1}`, name: `P${index + 1}`, hand, finishRank: null })),
    deck: [card("deck-1", "C", 4)],
    recycle: [],
    currentPlayerIndex: 0,
    trick: null,
    revolution: false,
    elevenBack: false,
    binding: null,
    phase: "playing",
    hasDrawn: false,
    passedPlayerIds: [],
    pendingEffect: null,
    effectQueue: [],
    postEffect: null,
    events: [],
    turn: 1,
    log: [],
  };
}

function expectOk(result: ReturnType<typeof playCards>): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe("game engine", () => {
  it("deals the requested number of cards and keeps card IDs unique", () => {
    const game = startGame({ playerCount: 4, handSize: 6, jokerCount: 2 }, () => 0.5);
    expect(game.players.every((player) => player.hand.length === 6)).toBe(true);
    expect(game.deck).toHaveLength(30);
    expect(assertCardIntegrity(game)).toBe(true);
  });

  it("uses custom player names", () => {
    const game = startGame({ playerCount: 2, handSize: 5, jokerCount: 0, playerNames: ["あおい", " "] });
    expect(game.players.map((player) => player.name)).toEqual(["あおい", "プレイヤー2"]);
  });

  it("draws one card when passing and allows play afterward", () => {
    const game = stateWithHands([[card("S-3", "S", 3)], [card("H-4", "H", 4)]]);
    const next = expectOk(pass(game));
    expect(next.players[0].hand).toHaveLength(2);
    expect(next.hasDrawn).toBe(true);
  });

  it("rejects a weaker play without mutating the original state", () => {
    const game = stateWithHands([[card("S-5", "S", 5)], [card("H-4", "H", 4)]]);
    game.trick = trick({});
    const result = playCards(game, ["S-5"]);
    expect(result).toEqual({ ok: false, error: "場のカードより強い役を選んでください。" });
    expect(game.players[0].hand).toHaveLength(1);
  });

  it("applies revolution when four cards of the same rank are played", () => {
    const game = stateWithHands([[
      card("S-6", "S", 6), card("H-6", "H", 6), card("D-6", "D", 6), card("C-6", "C", 6), card("S-9", "S", 9),
    ], [card("S-3", "S", 3)]]);
    const next = expectOk(playCards(game, ["S-6", "H-6", "D-6", "C-6"]));
    expect(next.revolution).toBe(true);
    expect(next.players[0].finishRank).toBeNull();
    expect(next.events.map((event) => event.kind)).toContain("revolution");
  });

  it("keeps a revolution after resolving a seven-transfer effect", () => {
    const game = stateWithHands([[
      card("S-7", "S", 7), card("H-7", "H", 7), card("D-7", "D", 7), card("C-7", "C", 7),
      card("S-9", "S", 9), card("H-9", "H", 9), card("D-9", "D", 9), card("C-9", "C", 9), card("S-10", "S", 10),
    ], [card("S-3", "S", 3)]]);
    const played = expectOk(playCards(game, ["S-7", "H-7", "D-7", "C-7"]));
    expect(played.revolution).toBe(true);
    const resolved = expectOk(resolveEffect(played, ["S-9", "H-9", "D-9", "C-9"]));
    expect(resolved.revolution).toBe(true);
  });

  it("does not allow a normal card to beat a single joker", () => {
    const game = stateWithHands([[card("C-3", "C", 3)], [card("JOKER-1", null, null, true)]]);
    game.trick = trick({ rank: 16, lowRank: 16, highRank: 16, suits: [], isJokerSingle: true });
    expect(playCards(game, ["C-3"])).toEqual({ ok: false, error: "ジョーカーにはスペード3以外のカードを出せません。" });
  });

  it("does not soft-lock when a seven leaves fewer cards than the transfer count", () => {
    // 7を出した後の手札は1枚。渡すと0枚になるため、効果は省略されターンが進む。
    const game = stateWithHands([[card("S-7", "S", 7), card("S-9", "S", 9)], [card("H-4", "H", 4)]]);
    const next = expectOk(playCards(game, ["S-7"]));
    expect(next.phase).toBe("playing");
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.players[0].hand).toHaveLength(1);
  });

  it("clamps the transfer count so that one card always remains", () => {
    const game = stateWithHands([[
      card("S-7", "S", 7), card("H-7", "H", 7), card("S-9", "S", 9), card("H-9", "H", 9),
    ], [card("C-4", "C", 4)]]);
    const next = expectOk(playCards(game, ["S-7", "H-7"]));
    expect(next.pendingEffect).toEqual({ type: "transfer", count: 1 });
  });

  it("resolves seven, ten and eight from one straight in order", () => {
    const game = stateWithHands([[
      card("S-7", "S", 7), card("S-8", "S", 8), card("S-9", "S", 9), card("S-10", "S", 10),
      card("H-4", "H", 4), card("H-5", "H", 5), card("H-6", "H", 6),
    ], [card("C-4", "C", 4)], [card("D-4", "D", 4)]]);
    const played = expectOk(playCards(game, ["S-7", "S-8", "S-9", "S-10"]));
    expect(played.pendingEffect).toEqual({ type: "transfer", count: 1 });

    const transferred = expectOk(resolveEffect(played, ["H-4"]));
    expect(transferred.pendingEffect).toEqual({ type: "discard", count: 1 });
    expect(transferred.players[1].hand.map((item) => item.id)).toContain("H-4");

    const discarded = expectOk(resolveEffect(transferred, ["H-5"]));
    expect(discarded.phase).toBe("playing");
    expect(discarded.trick).toBeNull();
    expect(discarded.currentPlayerIndex).toBe(0);
    expect(assertCardIntegrity(discarded)).toBe(true);
  });

  it("skips one player per five played", () => {
    const game = stateWithHands([
      [card("S-5", "S", 5), card("H-5", "H", 5), card("C-9", "C", 9)],
      [card("C-4", "C", 4)], [card("D-4", "D", 4)], [card("H-4", "H", 4)],
    ]);
    const next = expectOk(playCards(game, ["S-5", "H-5"]));
    expect(next.currentPlayerIndex).toBe(3);
  });

  it("requires every bound suit while binding is active", () => {
    const game = stateWithHands([[card("S-9", "S", 9), card("D-9", "D", 9), card("S-K", "S", 13)], [card("C-4", "C", 4)]]);
    game.trick = trick({ kind: "group", count: 2, rank: 6, lowRank: 6, highRank: 6, suits: ["S", "H"] });
    game.binding = ["S", "H"];
    const result = playCards(game, ["S-9", "D-9"]);
    expect(result.ok).toBe(false);
  });

  it("lets a joker fill a missing bound suit", () => {
    const game = stateWithHands([[card("S-9", "S", 9), card("JOKER-1", null, null, true), card("S-K", "S", 13)], [card("C-4", "C", 4)]]);
    game.trick = trick({ kind: "group", count: 2, rank: 6, lowRank: 6, highRank: 6, suits: ["S", "H"] });
    game.binding = ["S", "H"];
    expectOk(playCards(game, ["S-9", "JOKER-1"]));
  });

  it("completes a straight with a joker", () => {
    const game = stateWithHands([[card("H-4", "H", 4), card("H-6", "H", 6), card("JOKER-1", null, null, true), card("C-9", "C", 9)], [card("C-4", "C", 4)]]);
    expect(previewPlay(game, ["H-4", "H-6", "JOKER-1"])).toEqual({ ok: true, label: "3枚階段 4–6" });
  });

  it("rejects finishing with a special card", () => {
    const game = stateWithHands([[card("S-8", "S", 8)], [card("C-4", "C", 4)]]);
    expect(playCards(game, ["S-8"]).ok).toBe(false);
  });
});
