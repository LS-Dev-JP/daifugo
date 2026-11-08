import type { Card, GameEvent, GameState, PendingEffect, Phase, RuleSettings, Suit, Trick } from "../game/types";

/** ルーム作成時に指定できる設定。 */
export interface RoomSettings {
  /** 募集人数。この人数がそろうと自動で開始する。 */
  capacity: number;
  handSize: number;
  jokerCount: number;
  /** 募集一覧に表示するか。false の場合はルーム番号を知っている人だけが参加できる。 */
  isPublic: boolean;
  rules: RuleSettings;
}

export const maxSeats = 5;
export const minSeats = 2;
/** 募集人数がそろってから開始するまでの待ち時間。 */
export const autoStartDelayMs = 5_000;
/** 1手番の思考時間。過ぎると自動で進行する（7渡し・10捨ての選択はそれぞれ別に数える）。 */
export const turnTimeMs = 10_000;

/** 募集一覧に表示するルームの概要。 */
export interface RoomSummary {
  code: string;
  hostName: string;
  members: string[];
  capacity: number;
  handSize: number;
  jokerCount: number;
  rules: RuleSettings;
}

/** プレイヤーごとに見える範囲だけを含むゲーム状態。他人の手札・山札の中身は含めない。 */
export interface GameView {
  rules: RuleSettings;
  players: Array<{ id: string; name: string; handCount: number; finishRank: number | null }>;
  myHand: Card[];
  deckCount: number;
  currentPlayerIndex: number;
  trick: Trick | null;
  revolution: boolean;
  elevenBack: boolean;
  binding: Suit[] | null;
  phase: Phase;
  hasDrawn: boolean;
  passedPlayerIds: string[];
  pendingEffect: PendingEffect | null;
  events: GameEvent[];
  turn: number;
  log: string[];
}

export interface RoomView {
  code: string;
  status: "lobby" | "playing" | "finished";
  hostSeat: number;
  mySeat: number;
  settings: RoomSettings;
  seats: Array<{ name: string; connected: boolean }>;
  /** 状態が変わるたびに増える番号。演出の重複表示を防ぐために使う。 */
  version: number;
  /** 募集人数がそろって自動開始を待っている場合、開始までの残りミリ秒。 */
  startsInMs: number | null;
  /** 対戦中、現在の手番が自動で進行するまでの残りミリ秒。 */
  turnEndsInMs: number | null;
  game: GameView | null;
}

export type ClientMessage =
  | { type: "watchRooms" }
  | { type: "unwatchRooms" }
  | { type: "create"; name: string; settings: RoomSettings }
  | { type: "join"; code: string; name: string }
  | { type: "resume"; code: string; token: string }
  | { type: "settings"; settings: RoomSettings }
  | { type: "start" }
  | { type: "play"; cardIds: string[] }
  | { type: "pass" }
  | { type: "resolve"; cardIds: string[] }
  | { type: "leave" };

export type ServerMessage =
  | { type: "session"; code: string; token: string }
  | { type: "rooms"; rooms: RoomSummary[]; playing: number }
  | { type: "room"; room: RoomView }
  | { type: "error"; message: string; fatal?: boolean };

export function toGameView(state: GameState, seat: number): GameView {
  return {
    rules: state.rules,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      handCount: player.hand.length,
      finishRank: player.finishRank,
    })),
    myHand: state.players[seat]?.hand ?? [],
    deckCount: state.deck.length,
    currentPlayerIndex: state.currentPlayerIndex,
    trick: state.trick,
    revolution: state.revolution,
    elevenBack: state.elevenBack,
    binding: state.binding,
    phase: state.phase,
    hasDrawn: state.hasDrawn,
    passedPlayerIds: state.passedPlayerIds,
    pendingEffect: state.pendingEffect,
    events: state.events,
    turn: state.turn,
    log: state.log,
  };
}

function hiddenCards(prefix: string, count: number): Card[] {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, suit: null, rank: null, isJoker: false }));
}

/**
 * 画面部品は GameState を受け取るため、見えないカードを伏せ札で埋めて GameState の形に戻す。
 * 伏せ札は枚数表示にだけ使われ、判定はサーバー側で行う。
 */
export function viewToState(view: GameView, seat: number): GameState {
  return {
    rules: view.rules,
    players: view.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      hand: index === seat ? view.myHand : hiddenCards(`hidden-${index}`, player.handCount),
      finishRank: player.finishRank,
    })),
    deck: hiddenCards("deck", view.deckCount),
    recycle: [],
    currentPlayerIndex: view.currentPlayerIndex,
    trick: view.trick,
    revolution: view.revolution,
    elevenBack: view.elevenBack,
    binding: view.binding,
    phase: view.phase,
    hasDrawn: view.hasDrawn,
    passedPlayerIds: view.passedPlayerIds,
    pendingEffect: view.pendingEffect,
    effectQueue: [],
    postEffect: null,
    events: view.events,
    turn: view.turn,
    log: view.log,
  };
}
